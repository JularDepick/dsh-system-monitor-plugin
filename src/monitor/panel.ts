/*
 * 面板数据提供
 *
 * 面板数据的唯一展示出口:经 host webserver 注册数据端点,
 * 浏览器端「系统监控」tab 同源轮询快照。数据不暴露给 dsh 使用。
 * 作者:JularDepick
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { MONITOR_DATA_PATH } from '../constants'
import type { ProcessCollector } from './collector'

/** 面板数据提供器 */
export class MonitorPanel {
  /** 构造面板数据提供器 */
  constructor(private readonly collector: ProcessCollector) {}

  /** 注册面板数据路由(webServer 缺失时静默跳过) */
  attach(ctx: Context): void {
    const webServer = ctx.get('webServer')
    if (!webServer) return
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: MONITOR_DATA_PATH,
      handler: (_req: IncomingMessage, res: ServerResponse) => {
        const snapshot = this.collector.getSnapshot()
        const body = JSON.stringify(snapshot ?? {
          sampledAt: 0,
          pollInterval: this.collector.pollInterval,
          cpuCount: 0,
          totalMemoryBytes: 0,
          rootPid: 0,
          platform: '',
          degraded: false,
          processes: [],
          error: this.collector.getLastError(),
        })
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(body)
      },
    }))
  }
}