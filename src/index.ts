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
export { LinuxProcQuery, ProcessCollector, resolvePlatformLabel } from './monitor/collector'
/**
 * 纯函数解析与探测导出:仅供回归校验调用(源码侧解析用例与构建产物侧冒烟脚本共用同一份用例),
 * 不参与插件运行时装配,也不构成对外功能接口
 */
export { baselineKey, parseCimDate, parseCpuSeconds, parseElapsedSeconds, parsePsRecords, parseRecords } from './monitor/collector'
export { appendProbeHistory, probeDerived } from './monitor/clock-ticks'
export { cpuDisplayFactor, normalizeCpuScope, scaleCpuPercent } from './monitor/cpu-scope'
export { parseCpuCfsQuota, parseCpuMax, parseMemoryLimit, parseMemoryMax } from './monitor/cgroup'
export { parseSessionIdFromEnviron, terminalAncestor } from './monitor/attribution'
export { RowRetention } from './monitor/retention'
export { formatPercent } from './monitor/format'
export { sortRows, normalizeTableSort } from './monitor/table-sort'
export { layoutColumnWidths, distributeColumnWidths } from './monitor/table-layout'
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
