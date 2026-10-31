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

  /** 是否已挂载数据路由(宿主重复广播 internal/service 时不重复注册) */
  private attached = false

  /** 注册面板数据路由(webServer 缺失时静默跳过;重复调用只挂一次) */
  attach(ctx: Context): void {
    if (this.attached) return
    const webServer = ctx.get('webServer')
    if (!webServer) return
    this.attached = true
    ctx.effect(() => {
      const dispose = webServer.register({
        kind: 'exact',
        path: MONITOR_DATA_PATH,
        handler: (_req: IncomingMessage, res: ServerResponse) => {
          // 客户端提前断开时写响应会抛错,不得变成未处理的 Promise 拒绝
          void this.respond(res).catch(() => {})
        },
      })
      return () => {
        this.attached = false
        if (typeof dispose === 'function') dispose()
      }
    })
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
    /**
     * 有旧快照但最近一轮失败时,把失败原因随旧数据一并下发:
     * 面板保留旧数据继续展示,但据此改示徽章(否则查询持续失败时界面一直显示「正常」)。
     */
    const lastError = this.collector.getLastError()
    const stale = lastError === null || snapshot === null ? snapshot : { ...snapshot, degraded: true, error: lastError }
    // 占位快照只带真实失败原因(没有失败时不写 error 字段,避免出现 error: null)
    const placeholderError = this.collector.getLastError()
    const payload = stale ?? {
      sampledAt: 0,
      pollInterval: this.collector.pollInterval,
      cpuCount: 0,
      totalMemoryBytes: 0,
      cpuQuotaCores: null,
      memoryLimitBytes: null,
      rootPid: 0,
      platform: '',
      degraded: false,
      unreadableCount: 0,
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
      ...(placeholderError === null ? {} : { error: placeholderError }),
    }
    // 展示选项随每次响应下发:设置页改动插件配置后,面板下一次轮询即按新选项渲染
    const body = JSON.stringify({ ...payload, panelOptions: this.options() })
    try {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(body)
    } catch {
      // 响应已关闭(客户端断开):丢弃本次结果,由下一次轮询重新取数
    }
  }
}