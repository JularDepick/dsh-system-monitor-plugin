/*
 * 插件入口
 *
 * 导出 name、inject、apply,装配系统监控各模块。
 * 作者:JularDepick
 */

import type { Context } from '@deepseek-ai/cordis'
import { Config } from './config'
import { PLUGIN_NAME } from './constants'
import { setup } from './monitor'

export const name = PLUGIN_NAME

export const inject = ['tools']

export { Config }
export { ProcessCollector } from './monitor/collector'
export type {
  MonitorSnapshot,
  ProcessHandle,
  ProcessRecord,
  ReportReceipt,
  ReportRequest,
  ResourceSample,
} from './monitor/types'

export function apply(ctx: Context, config: Config) {
  setup(ctx, config)
}