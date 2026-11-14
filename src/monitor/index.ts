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
import { DEFAULT_POLL_INTERVAL, MAX_POLL_INTERVAL, MIN_POLL_INTERVAL } from '../constants'
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

/** 一个宿主服务实例上的派生包装记录 */
interface SpawnHook {
  /** 宿主原始派生方法(卸载时还原) */
  original: SubprocessFace['spawn']
  /** 本插件挂上的包装方法(还原前校验原型上仍是它) */
  wrapped: SubprocessFace['spawn']
  /** 各插件作用域各自的派生观察器(按注册顺序打开派生窗口) */
  watchers: Map<symbol, ChildSpawnWatcher>
}

/**
 * 已包装的派生入口(宿主服务实例本体 → 包装记录)。
 * 按作用域引用计数记账:同一实例被多次装配(热重载或两个 profile 实例并存)时共用同一份包装,
 * 包装内逐个打开各作用域的派生窗口,最后一个作用域卸载才还原宿主方法 ——
 * 早先的实现用「实例是否已挂钩」直接 return 并以模块级单例还原全部包装,
 * 后加载的作用域会永不挂钩,先卸载的作用域又会把别人的包装一并拿掉。
 */
const hookedSpawns = new Map<SubprocessFace, SpawnHook>()

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

/** 读取终端 pid 与会话的映射(服务缺失或异常时返回空表) */
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
function hookSubprocess(ctx: Context, watcher: ChildSpawnWatcher, scope: symbol): void {
  const view = ctx.get('subprocess') as unknown as SubprocessFace | undefined
  if (view === undefined || typeof view.spawn !== 'function') return
  const service = serviceInstance(view)
  const existing = hookedSpawns.get(service)
  // 该实例已有包装:本作用域登记自己的观察器即可,不重复包装
  if (existing !== undefined) {
    existing.watchers.set(scope, watcher)
    // 宿主就地替换了派生方法(热更新):原包装已不在实例上,按当前方法重新包装,派生归属不会静默失效
    if (service.spawn === existing.wrapped) return
  }
  /*
   * 原方法优先取服务实例本体上的方法:视图是 Cordis 代理,读回的可能是影子方法,
   * 卸载时把影子方法写回实例就等于把包装永久留在宿主上;实例上没有该方法时才退回视图
   */
  const instanceSpawn = (service as unknown as { spawn?: unknown }).spawn
  const original = (typeof instanceSpawn === 'function' ? instanceSpawn : view.spawn) as SubprocessFace['spawn']
  // 重新包装时沿用原记录(保留已登记的作用域),基准则换成实例当前的方法
  const hook: SpawnHook = existing ?? { original, wrapped: original, watchers: new Map() }
  hook.original = original
  const wrapped = function (this: unknown, spec: unknown, ...rest: unknown[]): unknown {
    /*
     * 各作用域的观察器依次开窗,宿主派生只调用一次(嵌套开窗,最内层触发真正派生),
     * 余下入参一并透传:包装只做观察,不改变宿主派生调用的签名与 this 语义
     */
    const watchers = [...hook.watchers.values()]
    const run = (index: number): unknown => index >= watchers.length
      ? Reflect.apply(hook.original, this, [spec, ...rest])
      : watchers[index].during(watchers[index].sessionOf(spec), () => run(index + 1))
    return run(0)
  }
  try {
    service.spawn = wrapped
  } catch {
    return
  }
  hook.wrapped = wrapped
  hook.watchers.set(scope, watcher)
  hookedSpawns.set(service, hook)
}

/** 注销某作用域的观察:该实例上再没有作用域时还原宿主方法(不把包装留给宿主) */
function unhookSubprocess(scope: symbol): void {
  for (const [service, hook] of [...hookedSpawns]) {
    hook.watchers.delete(scope)
    if (hook.watchers.size > 0) continue
    if (service.spawn === hook.wrapped) service.spawn = hook.original
    hookedSpawns.delete(service)
  }
}

/** 装配系统监控模块 */
export function setup(ctx: Context, config: Config): void {
  /** 本次装配的作用域标识:同一宿主服务实例上多作用域共存时据此各自记账与注销 */
  const scope = Symbol('system-monitor')
  const watcher = new ChildSpawnWatcher()
  const resolver = new OwnerResolver(readProcessEnviron, process.pid)
  // 轮询间隔在进入采集器前收敛到合规区间:配置 schema 已限界,这里再兜底一次,
  // 避免绕过 schema 的调用方(或超 32 位上限的定时器延时被压成 1 毫秒)把轮询变成查询进程风暴
  // NaN 会穿透 Math.round/min/max(NaN 参与比较恒为假),故先判有限性再收敛
  const requestedInterval = Number.isFinite(config.pollInterval) ? Math.round(config.pollInterval) : DEFAULT_POLL_INTERVAL
  const pollInterval = Math.min(MAX_POLL_INTERVAL, Math.max(MIN_POLL_INTERVAL, requestedInterval))
  const collector = new ProcessCollector(
    pollInterval,
    process.pid,
    createPlatformQuery(),
    (pids, parents, instances) => resolver.resolve(pids, parents, instances),
    (handle) => resolver.setReported(handle.pid, handle.sessionId),
  )

  // 派生归属在所有平台启用:Linux 上 /proc 环境信源只覆盖得到链尾进程,
  // 宿主经 systemd 瞬态 scope 派生时直接子进程(以及无 systemd 时的内部 runner)环境里没有会话标识,
  // 该中间层只有派生锚点认得出来,故这里不再按平台关闭
  ctx.effect(() => {
    hookSubprocess(ctx, watcher, scope)
    const off = ctx.on('internal/service', (name) => {
      if (name === 'subprocess') hookSubprocess(ctx, watcher, scope)
    })
    return () => {
      off()
      unhookSubprocess(scope)
    }
  })

  // 面板数据路由:webServer 现成则直接挂载,晚出现时由服务事件与每次轮询补挂;
  // 展示选项由插件配置提供(设置页改动后经宿主重载插件生效,随下次轮询下发)
  const panel = new MonitorPanel(collector, () => ({
    laneNames: config.laneNames,
    columns: config.columns,
    cpuScope: config.cpuScope,
    retainRounds: config.retainRounds,
    laneColorPool: [...config.laneColorPool],
    laneColorStrategy: config.laneColorStrategy,
  }))

  // 轮询采集:激活即执行首轮,卸载时自动清理;每轮先刷新宿主侧归属信息
  ctx.effect(() => {
    const tick = (): void => {
      /*
       * 先取走锚点再刷新宿主状态:锚点表只进不出,若取用被前面抛出的异常跳过,
       * 表内会一直累积;取走后再交给解析器,失败也只影响该轮归属
       */
      const anchors = watcher.takeAnchors()
      // 宿主服务读取异常只影响该轮归属(沿用上一轮的会话与锚点), 不得中断轮询,
      // 更不得把异常抛给 setInterval 的回调 —— 那会变成宿主的未捕获异常
      try {
        resolver.updateHostState(readSessionInfos(ctx), readTerminalOwners(ctx))
        resolver.updateSpawnAnchors(anchors)
      } catch {
        // 单轮归属信息不可用:保持上一轮结果继续采集
      }
      /*
       * 路由挂载在这里重试:attach 命中同一实例时直接返回,代价只有一次 ctx.get;
       * 只靠服务事件的话,webServer 现成而注册抛错时再也没有重挂入口,端点会一直 404
       */
      try {
        panel.attach(ctx)
      } catch {
        // 挂载异常不影响采集与上报
      }
      void collector.poll()
    }
    const timer = setInterval(tick, collector.pollInterval)
    tick()
    return () => clearInterval(timer)
  })

  registerReporter(ctx, collector)

  ctx.effect(() => {
    panel.attach(ctx)
    const off = ctx.on('internal/service', (name) => {
      if (name === 'webServer') panel.attach(ctx)
    })
    return () => {
      off()
      panel.detach()
    }
  })
}
