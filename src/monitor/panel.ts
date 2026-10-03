/*
 * 面板数据提供
 *
 * 面板数据的唯一展示出口:经 host webserver 注册数据端点,
 * 浏览器端「系统监控」tab 同源轮询快照。数据不暴露给 dsh 使用。
 * 作者:JularDepick
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { MONITOR_DATA_PATH, PANEL_FIRST_SAMPLE_WAIT_MS } from '../constants'
import type { ProcessCollector } from './collector'
import type { PanelOptions } from './types'

/** 面板数据提供器 */
export class MonitorPanel {
  /**
   * 构造面板数据提供器
   * @param options 读取当前面板展示选项(来自插件配置,随配置改动实时生效)
   */
  constructor(
    private readonly collector: ProcessCollector,
    private readonly options: () => PanelOptions,
  ) {}

  /** 注册面板数据路由(webServer 缺失时静默跳过) */
  attach(ctx: Context): void {
    const webServer = ctx.get('webServer')
    if (!webServer) return
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: MONITOR_DATA_PATH,
      handler: (_req: IncomingMessage, res: ServerResponse) => {
        void this.respond(res)
      },
    }))
  }

  /**
   * 回答一次面板数据请求。
   * 采集器尚未产出首份快照时先等待首轮采集计算完成(至多 `PANEL_FIRST_SAMPLE_WAIT_MS`),
   * 使浏览器端拿到的第一份响应就是完整快照,而不是会令面板置空的占位快照;
   * 等待超时(查询受阻等)后仍按占位快照回答,由面板继续轮询。
   */
  private async respond(res: ServerResponse): Promise<void> {
    const snapshot = this.collector.getSnapshot() ?? await this.collector.whenSampled(PANEL_FIRST_SAMPLE_WAIT_MS)
    // 请求可能已因客户端断开而结束,避免重复写入
    if (res.writableEnded) return
    const payload = snapshot ?? {
      sampledAt: 0,
      pollInterval: this.collector.pollInterval,
      cpuCount: 0,
      totalMemoryBytes: 0,
      rootPid: 0,
      platform: '',
      degraded: false,
      processes: [],
      // 占位合计:面板以 sampledAt 为 0 判为无有效数据,这里的数值不会被当作真实占用展示
      totals: {
        othersCpuPercent: 0,
        othersMemoryBytes: 0,
        othersMemoryPercent: 0,
        othersCount: 0,
        idleCpuPercent: 0,
        idleMemoryPercent: 0,
      },
      error: this.collector.getLastError(),
    }
    // 展示选项随每次响应下发:设置页改动插件配置后,面板下一次轮询即按新选项渲染
    const body = JSON.stringify({ ...payload, panelOptions: this.options() })
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(body)
  }
}