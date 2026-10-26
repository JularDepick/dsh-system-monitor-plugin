/*
 * 进程归属解析(会话维度)
 *
 * 把 OS 级进程样本归到具体会话,来源按优先级:
 *  1. 宿主服务:终端(PTY)会话快照给出 pid ↔ 会话;
 *  2. 宿主派生锚点:subprocess 派生入口的包装读出子进程 pid 与会话(见 spawn-tracking.ts);
 *  3. Agent 汇报:句柄可显式带 sessionId;
 *  4. 子进程环境(Linux/WSL):模型 shell 调用派生的进程带 DSH_SESSION_ID。
 * 环境读取与宿主查询都经注入函数实现,便于独立测试。
 * 第 2 条在所有平台启用,与第 4 条互补而非互为兜底:Linux 上宿主经 systemd 瞬态 scope 派生时,
 * 直接子进程的环境里没有会话标识(标识由内部 runner 从启动文件再应用),只有链尾进程读得到。
 * 环境读取失败与确认无该变量分属两种结果,前者按轮次有界重试后才放弃(见 ENVIRON_RETRY_LIMIT)。
 * 归属同时带上会话谱系(祖先会话序列),使子代理会话可归入其父会话的维度卡。
 * 归属仅用于面板分组展示,不改变采样口径,也不向 dsh 主体暴露。
 * 作者:JularDepick
 */

import { readFileSync } from 'node:fs'
import { ENVIRON_RETRY_LIMIT, SESSION_ENV_KEY } from '../constants'
import type { ProcessOwner } from './types'

/**
 * 进程环境探测结果:区分「读到」与「读取失败」两种情形。
 * 读到即环境已定型(进程生命周期内不变),没有该变量属确认无归属,可以长期缓存;
 * 读取失败(权限不足,进程刚派生尚未 exec)属可恢复情形,不得写入归属缓存。
 */
export type EnvironProbe =
  | { readonly readable: true; readonly environ: string }
  | { readonly readable: false }

/** 宿主在模型 shell 调用中注入的会话标识环境变量(Linux/WSL 可经 /proc/<pid>/environ 读回) */
const SESSION_ENV_PREFIX = `${SESSION_ENV_KEY}=`

/** 沿父进程链向上查找的深度上限(防止异常链成环导致解析失控) */
const SESSION_SUBTREE_MAX_DEPTH = 32

/** 会话谱系上溯的深度上限(与进程子树上溯同理,防止异常链成环导致解析失控) */
const SESSION_LINEAGE_MAX_DEPTH = 32

/** 会话元信息(宿主会话清单的一项) */
export interface SessionInfo {
  /** 会话标识 */
  sessionId: string
  /** 会话显示名(宿主会话标题) */
  label?: string
  /** 是否子代理(subagent 派生) */
  subagent?: boolean
  /** 父会话标识(子代理会话记录其派生来源;顶层会话缺席) */
  parentSession?: string
}

/**
 * 会话谱系:沿 `parentSession` 逐级上溯,返回自根到直接父会话的祖先标识序列(不含自身)。
 * 父会话不在本轮清单内时仍记入该标识(父会话可能已退出或未装载),其后无法继续上溯;
 * 链断、成环或超过深度上限即停止;顶层会话返回空数组。
 * 面板据此把子代理会话归入其父会话的维度卡,故与进程归属同源(导出以便纯函数回归)。
 */
export function sessionLineage(
  sessionId: string,
  sessions: ReadonlyMap<string, SessionInfo>,
  maxDepth: number = SESSION_LINEAGE_MAX_DEPTH,
): string[] {
  const ancestors: string[] = []
  const seen = new Set<string>([sessionId])
  let current = sessions.get(sessionId)?.parentSession
  while (current !== undefined && current.length > 0 && ancestors.length < maxDepth && !seen.has(current)) {
    seen.add(current)
    ancestors.push(current)
    current = sessions.get(current)?.parentSession
  }
  return ancestors.reverse()
}

/**
 * 取发起本次工具调用的会话标识(导出以便纯函数回归)。
 * 汇报句柄未显式标注会话时按调用方会话归属,模型因此只需报 pid 即可落进正确的会话卡;
 * 工具不在会话上下文中执行(无调用方 Agent)时返回 undefined,句柄按未归因处理。
 */
export function callerSessionId(exec: unknown): string | undefined {
  const agent = (exec as { agent?: unknown } | null | undefined)?.agent
  const header = (agent as { session?: { header?: { id?: unknown } } } | null | undefined)?.session?.header
  const id = header?.id
  return typeof id === 'string' && id.length > 0 ? id : undefined
}

/** 从 /proc/<pid>/environ 文本中取会话标识(缺失或为空时返回 undefined) */
export function parseSessionIdFromEnviron(environ: string): string | undefined {
  for (const entry of environ.split('\0')) {
    if (!entry.startsWith(SESSION_ENV_PREFIX)) continue
    const value = entry.slice(SESSION_ENV_PREFIX.length)
    if (value.length > 0) return value
  }
  return undefined
}

/**
 * 沿父进程链向上查找锚点所属会话(导出以便纯函数回归)。
 *
 * 锚点(终端或宿主派生锚点)只给出**顶层**进程标识,而模型 shell 调用会继续派生子进程,
 * 故整棵后代子树都应归给同一会话;这里从该进程的父进程开始逐级上溯,
 * 命中锚点即返回其会话;链中断、成环或超过深度上限时返回 undefined。
 */
export function ownerAncestor(
  pid: number,
  parents: ReadonlyMap<number, number | null>,
  anchors: ReadonlyMap<number, string>,
  maxDepth: number = SESSION_SUBTREE_MAX_DEPTH,
): string | undefined {
  let current = pid
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const parent = parents.get(current)
    if (parent === undefined || parent === null || parent === current) return undefined
    const session = anchors.get(parent)
    if (session !== undefined) return session
    current = parent
  }
  return undefined
}

/** 终端(PTY)锚点的子树归属(语义化别名,与派生锚点共用同一上溯规则) */
export function terminalAncestor(
  pid: number,
  parents: ReadonlyMap<number, number | null>,
  terminals: ReadonlyMap<number, string>,
  maxDepth: number = SESSION_SUBTREE_MAX_DEPTH,
): string | undefined {
  return ownerAncestor(pid, parents, terminals, maxDepth)
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
  /** 宿主派生锚点(pid → 会话标识):派生窗口内创建的子进程及其子树归该会话 */
  private readonly spawnAnchors = new Map<number, string>()
  /** 汇报来源映射(pid → 会话标识) */
  private reported = new Map<number, string>()
  /** 会话元信息(会话标识 → 显示名等) */
  private sessions = new Map<string, SessionInfo>()
  /** 会话谱系缓存(会话标识 → 祖先序列;宿主状态每轮刷新后失效) */
  private readonly lineages = new Map<string, string[]>()
  /** 本轮采样的父子关系(pid → 父 pid;用于终端子树归属) */
  private parents: ReadonlyMap<number, number | null> = new Map()
  /** 环境读取失败计数(pid → 连续失败轮数;达上限才按无归属处理并随 pid 消失裁剪) */
  private readonly environFailures = new Map<number, number>()
  /** 锚点绑定的进程实例令牌(pid → 并入锚点后首次采样到的令牌;令牌变化说明 pid 已被复用) */
  private readonly anchorInstances = new Map<number, string>()
  /** 归属缓存与上报归属绑定的实例令牌(pid → 令牌;令牌变化即丢弃该 pid 的缓存结论) */
  private readonly cacheInstances = new Map<number, string>()

  /** 构造解析器 */
  constructor(
    /** 探测指定进程的环境文本(读失败与读到区分结果,见 EnvironProbe) */
    private readonly readEnviron: (pid: number) => EnvironProbe,
    /** 宿主进程标识(不参与归属) */
    private readonly rootPid: number,
  ) {}

  /** 更新宿主侧会话清单与终端映射(每轮采样前调用) */
  updateHostState(sessions: readonly SessionInfo[], terminalPids: ReadonlyMap<number, string>): void {
    this.sessions = new Map(sessions.map((session) => [session.sessionId, session]))
    this.terminals = new Map(terminalPids)
    // 会话清单变化后谱系可能变化(新派生的子代理会话),故整体失效重算
    this.lineages.clear()
  }

  /**
   * 并入新解析到的宿主派生锚点(每轮采样前调用)。
   * 锚点一经并入即长期生效,直到该进程从采样集合里消失(见 `resolve` 的裁剪),
   * 故同一次派生窗口只需上报一次。
   */
  updateSpawnAnchors(anchors: ReadonlyMap<number, string>): void {
    for (const [pid, sessionId] of anchors) {
      this.spawnAnchors.set(pid, sessionId)
      // 新锚点对应一次新的派生,旧的实例绑定不能沿用
      this.anchorInstances.delete(pid)
    }
  }

  /** 记录 Agent 汇报句柄的会话归属(显式标注优先于环境推断) */
  setReported(pid: number, sessionId: string | undefined): void {
    if (sessionId === undefined || sessionId.length === 0) this.reported.delete(pid)
    else this.reported.set(pid, sessionId)
  }

  /**
   * 解析一批进程的归属(仅返回有归属的项)。
   * `instances` 给出本轮各进程的实例令牌(平台能给出时),用于两件事:
   * 一是发现 pid 被复用后作废对应锚点,避免新进程继承上一进程的会话;
   * 二是锚点进程自身退出后,只要其后代仍被采样到就继续保留该锚点(否则后代会在下一轮翻回未归因)。
   */
  resolve(
    pids: readonly number[],
    parents?: ReadonlyMap<number, number | null>,
    instances?: ReadonlyMap<number, string>,
  ): Map<number, ProcessOwner> {
    this.parents = parents ?? new Map()
    const alive = new Set(pids)
    // 先校验实例身份再解析:被复用的 pid 不会在当轮沿用上一进程的锚点或缓存结论
    this.pruneAnchors(alive, instances)
    this.pruneInstances(alive, instances)
    const owners = new Map<number, ProcessOwner>()
    for (const pid of pids) {
      const owner = this.resolveOne(pid)
      if (owner !== undefined) owners.set(pid, owner)
    }
    // 裁剪:只保留当前存在的 pid,规避 pid 复用带来的错误归属
    for (const pid of [...this.cached.keys()]) if (!alive.has(pid)) this.cached.delete(pid)
    for (const pid of [...this.reported.keys()]) if (!alive.has(pid)) this.reported.delete(pid)
    for (const pid of [...this.environFailures.keys()]) if (!alive.has(pid)) this.environFailures.delete(pid)
    return owners
  }

  /**
   * 锚点裁剪与实例绑定:
   * 1. 首次采样到锚点进程时记下其实例令牌(没有令牌的平台退回纯 pid 记账);
   * 2. 令牌与绑定值不一致说明该 pid 已被新进程复用,作废锚点与其后代归属;
   * 3. 锚点进程本身退出后,只要仍有存活进程把它当作祖先,就保留锚点(否则后代归属会翻回未归因);
   * 4. 既不在采样集合、也没有任何后代引用时才删除,保证映射不会无限增长。
   */
  /**
   * 归属缓存与环境结论同样绑定实例令牌:pid 被复用时,上一进程解析出的会话(以及显式汇报的会话)
   * 不得沿用到新进程上 —— 锚点已有这套校验,这两处原先只按 pid 记账。
   */
  private pruneInstances(alive: ReadonlySet<number>, instances: ReadonlyMap<number, string> | undefined): void {
    for (const pid of [...this.cached.keys(), ...this.reported.keys()]) {
      if (!alive.has(pid)) {
        this.cacheInstances.delete(pid)
        continue
      }
      const token = instances?.get(pid)
      if (token === undefined) continue
      const bound = this.cacheInstances.get(pid)
      if (bound === undefined) this.cacheInstances.set(pid, token)
      else if (bound !== token) {
        this.cached.delete(pid)
        this.reported.delete(pid)
        this.cacheInstances.delete(pid)
      }
    }
    for (const pid of [...this.cacheInstances.keys()]) if (!alive.has(pid)) this.cacheInstances.delete(pid)
  }

  private pruneAnchors(alive: ReadonlySet<number>, instances: ReadonlyMap<number, string> | undefined): void {
    for (const pid of this.spawnAnchors.keys()) {
      const token = instances?.get(pid)
      if (token === undefined) continue
      const bound = this.anchorInstances.get(pid)
      if (bound === undefined) this.anchorInstances.set(pid, token)
      else if (bound !== token) {
        this.spawnAnchors.delete(pid)
        this.anchorInstances.delete(pid)
      }
    }
    const referenced = new Set<number>()
    for (const pid of alive) {
      let current = this.parents.get(pid)
      for (let depth = 0; depth < SESSION_SUBTREE_MAX_DEPTH; depth += 1) {
        if (current === undefined || current === null) break
        if (this.spawnAnchors.has(current)) {
          referenced.add(current)
          break
        }
        current = this.parents.get(current)
      }
    }
    for (const pid of [...this.spawnAnchors.keys()]) {
      if (alive.has(pid) || referenced.has(pid)) continue
      this.spawnAnchors.delete(pid)
      this.anchorInstances.delete(pid)
    }
  }

  /** 解析单个进程的归属 */
  private resolveOne(pid: number): ProcessOwner | undefined {
    // 宿主进程自身:所有会话都在其中,不能归给某一个会话
    if (pid === this.rootPid) return undefined

    const terminalSession = this.terminals.get(pid)
    if (terminalSession !== undefined) return this.decorate(terminalSession)

    const spawnSession = this.spawnAnchors.get(pid)
    if (spawnSession !== undefined) return this.decorate(spawnSession)

    // 锚点的整棵后代子树同属该会话(锚点只给顶层 pid,模型 shell 派生链需上溯补齐)
    const subtreeSession = terminalAncestor(pid, this.parents, this.terminals)
      ?? ownerAncestor(pid, this.parents, this.spawnAnchors)
    if (subtreeSession !== undefined) return this.decorate(subtreeSession)

    const reportedSession = this.reported.get(pid)
    if (reportedSession !== undefined) return this.decorate(reportedSession)

    const cached = this.cached.get(pid)
    if (cached !== undefined) return cached ?? undefined

    const probe = this.readEnviron(pid)
    if (probe.readable) {
      const sessionId = parseSessionIdFromEnviron(probe.environ)
      const owner = sessionId === undefined ? null : this.decorate(sessionId)
      this.cached.set(pid, owner)
      this.environFailures.delete(pid)
      return owner ?? undefined
    }
    // 读失败不写缓存:进程环境要到 exec 才定型,此刻读到的是失败而非「没有该变量」,
    // 钉成无归属会让该 pid 在整个生命周期内都落进未归因组,故按轮次有界重试
    const failures = (this.environFailures.get(pid) ?? 0) + 1
    this.environFailures.set(pid, failures)
    if (failures >= ENVIRON_RETRY_LIMIT) this.cached.set(pid, null)
    return undefined
  }

  /** 组装归属对象(补上会话显示名,子代理标记与祖先会话谱系) */
  private decorate(sessionId: string): ProcessOwner {
    const info = this.sessions.get(sessionId)
    let lineage = this.lineages.get(sessionId)
    if (lineage === undefined) {
      lineage = sessionLineage(sessionId, this.sessions)
      this.lineages.set(sessionId, lineage)
    }
    return {
      sessionId,
      ...(info?.label === undefined || info.label.length === 0 ? {} : { label: info.label }),
      ...(info?.subagent === true ? { subagent: true } : {}),
      ...(lineage.length === 0 ? {} : { lineage }),
    }
  }
}

/** 探测进程环境文本(Linux/WSL 经 /proc;其它平台一律按不可读) */
export function readProcessEnviron(pid: number): EnvironProbe {
  if (process.platform !== 'linux') return { readable: false }
  try {
    // 进程环境在 exec 后定型;读取失败(权限不足,进程刚派生尚未 exec)由调用方按轮次重试
    return { readable: true, environ: readFileSync(`/proc/${pid}/environ`, 'utf8') }
  } catch {
    return { readable: false }
  }
}
