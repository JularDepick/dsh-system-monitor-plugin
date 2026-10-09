/*
 * 系统监控模块装配
 *
 * 进程资源采集、Agent 句柄汇报工具、面板数据提供三部分的总装;
 * 采集前先向宿主会话/终端服务取归属信息,并包装宿主 subprocess 派生入口,
 * 使样本带上会话维度归属。
 * 采集数据仅用于 UI 面板展示,不暴露给 dsh 使用。
 * 作者:JularDepick
 */

import { basename } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Config } from '../config'
import { OwnerResolver, readProcessEnviron } from './attribution'
import type { SessionInfo } from './attribution'
import { ProcessCollector, createPlatformQuery } from './collector'
import { MonitorPanel } from './panel'
import { registerReporter } from './reporter'
import { ChildSpawnWatcher } from './spawn-tracking'

/** 宿主 sessions 服务的最小类型面(类型家在各官方包,此处只取用到的能力) */
interface SessionsFace {
  /** 全部活动会话 */
  list(): Array<{ header: { id: string; cwd?: string; origin?: string; parentSession?: string } }>
}

/** 宿主 sessionTitle 服务的最小类型面 */
interface SessionTitleFace {
  /** 读取某会话的最近标题快照 */
  get(session: unknown): { title?: string } | undefined
}

/** 宿主 agents 服务的最小类型面 */
interface AgentsFace {
  /** 全部活动 Agent(即会话) */
  list(): Array<{ id: string }>
}

/** 宿主 terminals 服务的最小类型面 */
interface TerminalsFace {
  /** 某 Agent 名下的终端会话快照 */
  list(owner: unknown): Array<{ pid?: number }>
}

/** 宿主 subprocess 服务的最小类型面(派生入口是本插件唯一的包装点) */
interface SubprocessFace {
  /** 派生一个受管子进程,返回句柄(入参为宿主内部规范结构) */
  spawn(spec: unknown): unknown
}

/** 已包装的派生入口(宿主服务实例本体 → 原始方法与包装方法),插件卸载时按此还原 */
const hookedSpawns = new Map<SubprocessFace, { original: SubprocessFace['spawn']; wrapped: SubprocessFace['spawn'] }>()

/** Cordis 服务经代理暴露给上下文,该全局符号指向服务实例本体(包装落在本体上才稳定可查) */
const CORDIS_ORIGINAL = Symbol.for('cordis.original')

/** 取宿主服务实例本体(取不到原始实例时退回代理本身) */
function serviceInstance(view: SubprocessFace): SubprocessFace {
  const original = (view as unknown as Record<symbol, unknown>)[CORDIS_ORIGINAL]
  return typeof original === 'object' && original !== null ? original as SubprocessFace : view
}

/**
 * 读取宿主会话清单(服务缺失或异常时返回空表)。
 * 除显示名与子代理标记外一并取父会话标识:面板据此把子代理会话归入其父会话的维度卡。
 */
function readSessionInfos(ctx: Context): SessionInfo[] {
  const sessions = ctx.get('sessions') as unknown as SessionsFace | undefined
  if (!sessions) return []
  const titles = ctx.get('sessionTitle') as unknown as SessionTitleFace | undefined
  return sessions.list().map((session) => {
    const title = titles?.get(session)?.title
    const cwd = session.header.cwd
    const label = title !== undefined && title.length > 0
      ? title
      : cwd !== undefined && cwd.length > 0
        ? basename(cwd)
        : session.header.id
    const parentSession = session.header.parentSession
    return {
      sessionId: session.header.id,
      label,
      ...(session.header.origin === 'subagent' ? { subagent: true } : {}),
      ...(parentSession === undefined || parentSession.length === 0 ? {} : { parentSession }),
    }
  })
}

/** 读取终端 pid ↔ 会话映射(服务缺失或异常时返回空表) */
function readTerminalOwners(ctx: Context): Map<number, string> {
  const owners = new Map<number, string>()
  const agents = ctx.get('agents') as unknown as AgentsFace | undefined
  const terminals = ctx.get('terminals') as unknown as TerminalsFace | undefined
  if (!agents || !terminals) return owners
  for (const agent of agents.list()) {
    for (const snapshot of terminals.list(agent)) {
      if (typeof snapshot.pid === 'number' && snapshot.pid > 0) owners.set(snapshot.pid, agent.id)
    }
  }
  return owners
}

/**
 * 包装宿主 subprocess 服务的派生入口。
 *
 * 包装只做透传:派生调用原样交给宿主实现,只在调用期间打开一个「派生窗口」,
 * 供派生观察器读回宿主本次创建的子进程标识(见 spawn-tracking.ts)。
 * 服务缺失或实例不可写时保持宿主原样,该平台退化为无派生归属(面板显示空态)。
 */
function hookSubprocess(ctx: Context, watcher: ChildSpawnWatcher): void {
  const view = ctx.get('subprocess') as unknown as SubprocessFace | undefined
  if (view === undefined || typeof view.spawn !== 'function') return
  const service = serviceInstance(view)
  if (hookedSpawns.has(service)) return
  // 原方法经服务视图取得并按调用时的 this 透传,包装不改变宿主的调用语义
  const original = view.spawn
  const wrapped = function (this: unknown, spec: unknown): unknown {
    return watcher.during(watcher.sessionOf(spec), () => original.call(this, spec))
  }
  try {
    service.spawn = wrapped
  } catch {
    return
  }
  hookedSpawns.set(service, { original, wrapped })
}

/** 还原被包装的派生入口(插件卸载时调用,不把包装留给宿主) */
function unhookSubprocess(): void {
  for (const [service, entry] of hookedSpawns) {
    if (service.spawn === entry.wrapped) service.spawn = entry.original
  }
  hookedSpawns.clear()
}

/** 装配系统监控模块 */
export function setup(ctx: Context, config: Config): void {
  const watcher = new ChildSpawnWatcher()
  const resolver = new OwnerResolver(readProcessEnviron, process.pid)
  const collector = new ProcessCollector(
    config.pollInterval,
    process.pid,
    createPlatformQuery(),
    (pids, parents) => resolver.resolve(pids, parents),
    (handle) => resolver.setReported(handle.pid, handle.sessionId),
  )

  // 派生归属只在读不到进程环境的平台上启用:Linux 与 WSL 已由 /proc 环境信源覆盖,
  // 故不为这些平台增加包装与原型挂钩
  if (process.platform !== 'linux') {
    ctx.effect(() => {
      hookSubprocess(ctx, watcher)
      const off = ctx.on('internal/service', (name) => {
        if (name === 'subprocess') hookSubprocess(ctx, watcher)
      })
      return () => {
        off()
        unhookSubprocess()
      }
    })
  }

  // 轮询采集:激活即执行首轮,卸载时自动清理;每轮先刷新宿主侧归属信息
  ctx.effect(() => {
    const tick = (): void => {
      resolver.updateHostState(readSessionInfos(ctx), readTerminalOwners(ctx))
      resolver.updateSpawnAnchors(watcher.takeAnchors())
      void collector.poll()
    }
    const timer = setInterval(tick, collector.pollInterval)
    tick()
    return () => clearInterval(timer)
  })

  registerReporter(ctx, collector)

  // 面板数据路由:webServer 现成则直接挂载,晚出现时补挂;
  // 展示选项由插件配置提供(设置页改动后经宿主重载插件生效,随下次轮询下发)
  const panel = new MonitorPanel(collector, () => ({
    laneNames: config.laneNames,
    columns: config.columns,
    cpuScope: config.cpuScope,
    retainRounds: config.retainRounds,
    laneColorPool: [...config.laneColorPool],
    laneColorStrategy: config.laneColorStrategy,
  }))
  const mount = (): void => panel.attach(ctx)
  ctx.effect(() => {
    mount()
    return ctx.on('internal/service', (name) => {
      if (name === 'webServer') mount()
    })
  })
}
