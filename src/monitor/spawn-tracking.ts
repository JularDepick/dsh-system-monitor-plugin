/*
 * 子进程派生的会话归属(读不到进程环境的平台的自动信源)
 *
 * 宿主每次模型 shell 调用都经 subprocess 服务派生进程,并在派生入参的环境里带上
 * 会话标识(`DSH_SESSION_ID`);Linux 与 WSL 能经 `/proc/<pid>/environ` 读回该变量,
 * Windows 与 macOS 读不到进程环境,故本模块补上这条信源:
 *  1. 宿主 subprocess 服务派生入口的外层包装打开一个「派生窗口」,窗口内记下本次派生的会话;
 *  2. 窗口期间临时挂钩 `ChildProcess.prototype.spawn`,读回宿主本次真正创建的子进程标识,
 *     窗口退出即还原原型,宿主其它派生路径完全不受影响;
 *  3. 子进程自身环境里带会话标识时直接采信(不设中间 runner 的直接派生路径)。
 * Windows 上宿主经 Job runner 间接派生,锚点因此落在 runner 上,
 * 被派生的命令行进程按父子链覆盖(与终端子树归属同一套上溯规则)。
 * 归属只用于面板分组,不改变采样口径,也不向 dsh 主体暴露。
 * 作者:JularDepick
 */

import { ChildProcess } from 'node:child_process'
import { SESSION_ENV_KEY } from '../constants'

/** 派生锚点表:宿主派生窗口内创建的子进程标识 → 会话标识 */
export type SpawnAnchors = ReadonlyMap<number, string>

/** 会话标识在环境表里的前缀形态(`KEY=`) */
const SESSION_ENV_PREFIX = `${SESSION_ENV_KEY}=`

/** ChildProcess 的实现细节:该原型方法真正创建系统进程并把标识写回实例 */
interface ChildProcessSpawnHost {
  /** 创建系统进程(入参为 Node 规范化后的派生选项) */
  spawn: (this: unknown, options: unknown) => unknown
}

/** 派生入参的最小类型面:会话标识随 shell 环境一并给出 */
interface SpawnSpecFace {
  /** 显式环境项(宿主 shell 工具已注入 `DSH_*` 事实) */
  env?: unknown
}

/** 从环境表(KEY=VALUE 字符串数组)取会话标识;缺失或为空返回 undefined(导出以便回归) */
export function sessionIdFromEnvPairs(pairs: unknown): string | undefined {
  if (!Array.isArray(pairs)) return undefined
  for (const entry of pairs) {
    if (typeof entry !== 'string' || !entry.startsWith(SESSION_ENV_PREFIX)) continue
    const value = entry.slice(SESSION_ENV_PREFIX.length)
    if (value.length > 0) return value
  }
  return undefined
}

/** 从派生入参的对象式环境取会话标识(非字符串或空值按缺失处理;导出以便回归) */
export function sessionIdFromEnv(env: unknown): string | undefined {
  if (typeof env !== 'object' || env === null) return undefined
  const value = (env as Record<string, unknown>)[SESSION_ENV_KEY]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * 子进程派生观察器。
 *
 * 宿主派生调用的外层包装经 `during` 打开窗口,窗口期间挂上原型挂钩,
 * 宿主本次创建的每个子进程都被记为锚点;窗口退出立即卸载挂钩。
 */
export class ChildSpawnWatcher {
  /** 尚未交给归属解析器的新锚点 */
  private readonly pending = new Map<number, string>()
  /** 派生窗口栈(嵌套派生时取最内层会话) */
  private readonly windows: (string | undefined)[] = []
  /** 当前挂钩函数(卸载时校验原型上仍是自己,避免还原掉他人替换) */
  private hooked: ((this: unknown, options: unknown) => unknown) | null = null
  /** 被挂钩的原始原型方法 */
  private original: ((this: unknown, options: unknown) => unknown) | null = null

  /**
   * 在指定会话的派生窗口内执行一次宿主派生调用(包装层调用)。
   * 会话缺失时该次派生不参与归属,调用本身不受影响;
   * 宿主派生抛错时按原样抛出,不留残余窗口。
   */
  during<T>(sessionId: string | undefined, body: () => T): T {
    this.windows.push(sessionId)
    if (this.hooked === null) this.hook()
    try {
      return body()
    } finally {
      this.windows.pop()
      if (this.windows.length === 0) this.unhook()
    }
  }

  /** 取走新解析的派生锚点(取走即清空;归属解析器自行保管并按存活进程裁剪) */
  takeAnchors(): Map<number, string> {
    const anchors = new Map(this.pending)
    this.pending.clear()
    return anchors
  }

  /** 读取派生入参里的会话标识(宿主 shell 工具按每次调用注入) */
  sessionOf(spec: unknown): string | undefined {
    return sessionIdFromEnv((spec as SpawnSpecFace | undefined)?.env)
  }

  /** 挂钩进程创建方法(仅派生窗口期间生效,原型不可写时退化为不记录) */
  private hook(): void {
    const host = ChildProcess.prototype as unknown as ChildProcessSpawnHost
    const original = host.spawn
    if (typeof original !== 'function') return
    const watcher = this
    const hooked = function (this: unknown, options: unknown): unknown {
      const result = original.call(this, options)
      try {
        watcher.record(this, options)
      } catch {
        // 归属解析失败只表现为该进程未归因,不得影响宿主派生本身
      }
      return result
    }
    host.spawn = hooked
    this.original = original
    this.hooked = hooked
  }

  /** 卸载原型挂钩(原型已被他人替换时不动,避免破坏宿主) */
  private unhook(): void {
    const host = ChildProcess.prototype as unknown as ChildProcessSpawnHost
    if (this.hooked !== null && host.spawn === this.hooked && this.original !== null) {
      host.spawn = this.original
    }
    this.hooked = null
    this.original = null
  }

  /** 记录窗口内创建的一个子进程:自身环境优先,其次取当前窗口会话 */
  private record(child: unknown, options: unknown): void {
    const pid = (child as { pid?: unknown } | null)?.pid
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return
    const pairs = (options as { envPairs?: unknown } | null)?.envPairs
    const sessionId = sessionIdFromEnvPairs(pairs) ?? this.windows[this.windows.length - 1]
    if (sessionId === undefined || sessionId.length === 0) return
    this.pending.set(pid, sessionId)
  }
}
