/*
 * CPU 展示口径换算
 *
 * 采集与差分口径始终是整机口径(占全部逻辑处理器的百分比),单核口径只是展示换算:
 * 单核口径值 = 整机口径值 × 逻辑处理器数量,故多线程进程可超过 100%。
 * 这里保持纯函数,便于回归校验与两侧复用。
 */

import type { CpuScope } from '../constants'

/** 归一化 CPU 展示口径:非已知取值返回 null(由调用方回退默认值) */
export function normalizeCpuScope(value: unknown): CpuScope | null {
  return value === 'machine' || value === 'core' ? value : null
}

/**
 * 取得展示换算倍率:整机口径为 1,单核口径为逻辑处理器数量。
 * 处理器数量缺失或非法时按 1 处理,避免把无效倍率带进面板。
 */
export function cpuDisplayFactor(scope: CpuScope, cpuCount: number): number {
  if (scope !== 'core') return 1
  return Number.isFinite(cpuCount) && cpuCount >= 1 ? cpuCount : 1
}

/** 按倍率换算一个整机口径百分比(不在此处截断上限,单核口径允许超过 100%) */
export function scaleCpuPercent(percent: number, factor: number): number {
  return Number.isFinite(percent) ? percent * factor : 0
}
