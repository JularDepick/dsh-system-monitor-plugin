/*
 * 进程归属解析(会话维度)
 *
 * 把 OS 级进程样本归到具体会话,来源按优先级:
 *  1. 宿主服务:终端(PTY)会话快照给出 pid ↔ 会话;
 *  2. Agent 汇报:句柄可显式带 sessionId;
 *  3. 子进程环境(Linux/WSL):模型 shell 调用派生的进程带 DSH_SESSION_ID。
 * 环境读取与宿主查询都经注入函数实现,便于独立测试。
 * 归属仅用于面板分组展示,不改变采样口径,也不向 dsh 主体暴露。
 * 作者:JularDepick
 */

import { readFileSync } from 'node:fs'
import type { ProcessOwner } from './types'

/** 宿主在模型 shell 调用中注入的会话标识环境变量(Linux/WSL 可经 /proc/<pid>/environ 读回) */
const SESSION_ENV_KEY = 'DSH_SESSION_ID='

/** 沿父进程链向上查找的深度上限(防止异常链成环导致解析失控) */
const SESSION_SUBTREE_MAX_DEPTH = 32

/** 会话元信息(宿主会话清单的一项) */
export interface SessionInfo {
  /** 会话标识 */
  sessionId: string
  /** 会话显示名(宿主会话标题) */
  label?: string
  /** 是否子代理(subagent 派生) */
  subagent?: boolean
}

/** 从 /proc/<pid>/environ 文本中取会话标识(缺失或为空时返回 undefined) */
export function parseSessionIdFromEnviron(environ: string): string | undefined {
  for (const entry of environ.split('\0')) {
    if (!entry.startsWith(SESSION_ENV_KEY)) continue
    const value = entry.slice(SESSION_ENV_KEY.length)
    if (value.length > 0) return value
  }
  return undefined
}

/**
 * 沿父进程链向上查找终端(PTY)锚点所属会话(导出以便纯函数回归)。
 *
 * 终端服务只给出该会话的**顶层**终端 pid,而模型 shell 调用会继续派生子进程,
 * 故整棵后代子树都应归给同一会话;这里从该进程的父进程开始逐级上溯,
 * 命中终端 pid 即返回其会话;链中断、成环或超过深度上限时返回 undefined。
 */
export function terminalAncestor(
  pid: number,
  parents: ReadonlyMap<number, number | null>,
  terminals: ReadonlyMap<number, string>,
  maxDepth: number = SESSION_SUBTREE_MAX_DEPTH,
): string | undefined {
  let current = pid
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const parent = parents.get(current)
    if (parent === undefined || parent === null || parent === current) return undefined
    const session = terminals.get(parent)
    if (session !== undefined) return session
    current = parent
  }
  return undefined
}

/**
 * 归属解析器。
 *
 * 环境在进程生命周期内不变,故解析结果按 pid 缓存;每轮以当前 pid 集合裁剪缓存,
 * 避免 pid 复用导致的历史结果串到新进程上。宿主进程自身不参与归属(面板归入「宿主」组)。
 */
export class OwnerResolver {
  /** 已解析结果缓存(pid → 归属;null 表示已确认无归属) */
  private readonly cached = new Map<number, ProcessOwner | null>()
  /** 终端来源映射(pid → 会话标识) */
  private terminals = new Map<number, string>()
  /** 汇报来源映射(pid → 会话标识) */
  private reported = new Map<number, string>()
  /** 会话元信息(会话标识 → 显示名等) */
  private sessions = new Map<string, SessionInfo>()
  /** 本轮采样的父子关系(pid → 父 pid;用于终端子树归属) */
  private parents: ReadonlyMap<number, number | null> = new Map()

  /** 构造解析器 */
  constructor(
    /** 读取指定进程的环境文本(不可读时返回 undefined) */
    private readonly readEnviron: (pid: number) => string | undefined,
    /** 宿主进程标识(不参与归属) */
    private readonly rootPid: number,
  ) {}

  /** 更新宿主侧会话清单与终端映射(每轮采样前调用) */
  updateHostState(sessions: readonly SessionInfo[], terminalPids: ReadonlyMap<number, string>): void {
    this.sessions = new Map(sessions.map((session) => [session.sessionId, session]))
    this.terminals = new Map(terminalPids)
  }

  /** 记录 Agent 汇报句柄的会话归属(显式标注优先于环境推断) */
  setReported(pid: number, sessionId: string | undefined): void {
    if (sessionId === undefined || sessionId.length === 0) this.reported.delete(pid)
    else this.reported.set(pid, sessionId)
  }

  /** 解析一批进程的归属(仅返回有归属的项) */
  resolve(pids: readonly number[], parents?: ReadonlyMap<number, number | null>): Map<number, ProcessOwner> {
    this.parents = parents ?? new Map()
    const owners = new Map<number, ProcessOwner>()
    for (const pid of pids) {
      const owner = this.resolveOne(pid)
      if (owner !== undefined) owners.set(pid, owner)
    }
    // 裁剪:只保留当前存在的 pid,规避 pid 复用带来的错误归属
    const alive = new Set(pids)
    for (const pid of [...this.cached.keys()]) if (!alive.has(pid)) this.cached.delete(pid)
    for (const pid of [...this.reported.keys()]) if (!alive.has(pid)) this.reported.delete(pid)
    return owners
  }

  /** 解析单个进程的归属 */
  private resolveOne(pid: number): ProcessOwner | undefined {
    // 宿主进程自身:所有会话都在其中,不能归给某一个会话
    if (pid === this.rootPid) return undefined

    const terminalSession = this.terminals.get(pid)
    if (terminalSession !== undefined) return this.decorate(terminalSession)

    // 终端 pid 的整棵后代子树同属该会话(终端服务只给顶层 pid,模型 shell 派生链需上溯补齐)
    const subtreeSession = terminalAncestor(pid, this.parents, this.terminals)
    if (subtreeSession !== undefined) return this.decorate(subtreeSession)

    const reportedSession = this.reported.get(pid)
    if (reportedSession !== undefined) return this.decorate(reportedSession)

    const cached = this.cached.get(pid)
    if (cached !== undefined) return cached ?? undefined

    const environ = this.readEnviron(pid)
    const sessionId = environ === undefined ? undefined : parseSessionIdFromEnviron(environ)
    const owner = sessionId === undefined ? null : this.decorate(sessionId)
    this.cached.set(pid, owner)
    return owner ?? undefined
  }

  /** 组装归属对象(补上会话显示名与子代理标记) */
  private decorate(sessionId: string): ProcessOwner {
    const info = this.sessions.get(sessionId)
    return {
      sessionId,
      ...(info?.label === undefined || info.label.length === 0 ? {} : { label: info.label }),
      ...(info?.subagent === true ? { subagent: true } : {}),
    }
  }
}

/** 读取进程环境文本(Linux/WSL 经 /proc;其它平台返回 undefined) */
export function readProcessEnviron(pid: number): string | undefined {
  if (process.platform !== 'linux') return undefined
  try {
    // 进程环境在生命周期内不变;读取失败(权限、进程已退出)按无归属处理
    return readFileSync(`/proc/${pid}/environ`, 'utf8')
  } catch {
    return undefined
  }
}
