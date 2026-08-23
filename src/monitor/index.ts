/*
 * 系统监控模块装配
 *
 * 进程资源采集、Agent 句柄汇报工具、面板数据提供三部分的总装。
 * 采集数据仅用于 UI 面板展示,不暴露给 dsh 使用。
 * 作者:JularDepick
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Config } from '../config'
import { ProcessCollector } from './collector'
import { MonitorPanel } from './panel'
import { registerReporter } from './reporter'

/** 装配系统监控模块 */
export function setup(ctx: Context, config: Config): void {
  const collector = new ProcessCollector(config.pollInterval, process.pid)

  // 轮询采集:激活即执行首轮,卸载时自动清理
  ctx.effect(() => {
    const timer = setInterval(() => void collector.poll(), collector.pollInterval)
    void collector.poll()
    return () => clearInterval(timer)
  })

  registerReporter(ctx, collector)

  // 面板数据路由:webServer 现成则直接挂载,晚出现时补挂
  const panel = new MonitorPanel(collector)
  const mount = (): void => panel.attach(ctx)
  ctx.effect(() => {
    mount()
    return ctx.on('internal/service', (name) => {
      if (name === 'webServer') mount()
    })
  })
}