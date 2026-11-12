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

  /**
   * 当前已挂载的数据路由:记下挂到哪个 webServer 实例,
   * 宿主热重启 webServer(旧实例 dispose、新实例 provide)时据此重新挂载;
   * 旧实现只记「是否挂过」,实例更替后路由随旧服务消失而不再重挂,端点会一直 404。
   */
  private route: { server: unknown; dispose: (() => void) | null } | null = null

  /** 注册面板数据路由(webServer 缺失时静默跳过;同一实例重复调用只挂一次) */
  attach(ctx: Context): void {
    const webServer = ctx.get('webServer')
    if (!webServer) return
    if (this.route !== null && this.route.server === webServer) return
    // 实例更替:先摘掉旧路由再挂
    this.detach()
    let dispose: (() => void) | null = null
    try {
      const registered: unknown = webServer.register({
        kind: 'exact',
        path: MONITOR_DATA_PATH,
        handler: (_req: IncomingMessage, res: ServerResponse) => {
          // 客户端提前断开时写响应会抛错,不得变成未处理的 Promise 拒绝
          void this.respond(res).catch(() => {})
        },
      })
      dispose = typeof registered === 'function' ? registered as () => void : null
    } catch {
      // 挂载失败(宿主未提供路由扩展点或实例已失效)不留记录:下次服务事件或再次挂载时重试
      return
    }
    this.route = { server: webServer, dispose }
  }

  /** 摘掉当前数据路由(插件卸载或 webServer 实例更替时调用) */
  detach(): void {
    const route = this.route
    this.route = null
    if (route !== null && route.dispose !== null) route.dispose()
  }

  /**
   * 回答一次面板数据请求。
   * 采集器尚未产出首份快照时先等待首轮采集计算完成(至多 `PANEL_FIRST_SAMPLE_WAIT_MS`),
   * 使浏览器端拿到的第一份响应就是完整快照,而不是会令面板置空的占位快照;
   * 等待超时(查询受阻等)后仍按占位快照回答,由面板继续轮询。
   */
  private async respond(res: ServerResponse): Promise<void> {
    /**
     * 已有失败原因时不再等首轮:持久失败(含未适配平台)下每次请求都会白等满等待窗口,
     * 面板的首答与失败恢复因此各迟滞一次;失败原因随占位快照立即下发,由面板改示徽章
     */
    const lastError = this.collector.getLastError()
    const current = this.collector.getSnapshot()
    const snapshot = current !== null
      ? current
      : lastError !== null
        ? null
        : await this.collector.whenSampled(PANEL_FIRST_SAMPLE_WAIT_MS)
    // 请求可能已因客户端断开而结束,避免重复写入
    if (res.writableEnded) return
    /**
     * 有旧快照但最近一轮失败时,把失败原因随旧数据一并下发:
     * 面板保留旧数据继续展示,但据此改示徽章(否则查询持续失败时界面一直显示「正常」)。
     */
    const stale = lastError === null || snapshot === null ? snapshot : { ...snapshot, degraded: true, error: lastError }
    // 占位快照只带真实失败原因(没有失败时不写 error 字段,避免出现 error: null)
    const placeholderError = lastError
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
    try {
      // 展示选项与序列化也放进 try:它们抛错时同样不能把请求悬在那里
      const body = JSON.stringify({ ...payload, panelOptions: this.options() })
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(body)
    } catch {
      // 响应已关闭(客户端断开)或序列化失败:丢弃本次结果,由下一次轮询重新取数
    }
  }
}