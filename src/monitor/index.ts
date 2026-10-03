/*
 * 系统监控模块装配
 *
 * 进程资源采集、Agent 句柄汇报工具、面板数据提供三部分的总装;
 * 采集前先向宿主会话/终端服务取归属信息,使样本带上对话维度归属。
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

/** 宿主 sessions 服务的最小类型面(类型家在各官方包,此处只取用到的能力) */
interface SessionsFace {
  /** 全部活动会话 */
  list(): Array<{ header: { id: string; cwd?: string; origin?: string } }>
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

/** 读取宿主会话清单(服务缺失或异常时返回空表) */
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
    return {
      sessionId: session.header.id,
      label,
      ...(session.header.origin === 'subagent' ? { subagent: true } : {}),
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

/** 装配系统监控模块 */
export function setup(ctx: Context, config: Config): void {
  const resolver = new OwnerResolver(readProcessEnviron, process.pid)
  const collector = new ProcessCollector(
    config.pollInterval,
    process.pid,
    createPlatformQuery(),
    (pids, parents) => resolver.resolve(pids, parents),
    (handle) => resolver.setReported(handle.pid, handle.sessionId),
  )

  // 轮询采集:激活即执行首轮,卸载时自动清理;每轮先刷新宿主侧归属信息
  ctx.effect(() => {
    const tick = (): void => {
      resolver.updateHostState(readSessionInfos(ctx), readTerminalOwners(ctx))
      void collector.poll()
    }
    const timer = setInterval(tick, collector.pollInterval)
    tick()
    return () => clearInterval(timer)
  })

  registerReporter(ctx, collector)

  // 面板数据路由:webServer 现成则直接挂载,晚出现时补挂;
  // 展示选项由插件配置提供(设置页改动后经宿主重载插件生效,随下次轮询下发)
  const panel = new MonitorPanel(collector, () => ({ laneNames: config.laneNames, columns: config.columns, cpuScope: config.cpuScope }))
  const mount = (): void => panel.attach(ctx)
  ctx.effect(() => {
    mount()
    return ctx.on('internal/service', (name) => {
      if (name === 'webServer') mount()
    })
  })
}
