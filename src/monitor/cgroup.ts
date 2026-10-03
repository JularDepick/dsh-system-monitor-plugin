/*
 * 容器配额读取(cgroup v2 与 v1)
 *
 * 容器内「整机口径」应当是运行环境自身的配额,而不是宿主机(或虚拟机)的总量;
 * 这里只读运行环境自身可见的 cgroup 文件,不穿透宿主机。
 * 读取一律尽力而为:文件缺失或不可解析时返回 null,由调用方回退到可见总量。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 容器配额(两项独立,缺失表示该维度无配额) */
export interface CgroupLimits {
  /** CPU 配额核数(可为小数) */
  cpuQuotaCores: number | null
  /** 内存配额字节数 */
  memoryLimitBytes: number | null
}

/** v1 内存限额用来表示「不限」的哨兵值起点(达到或超出即视为不限) */
const V1_UNLIMITED_MEMORY = 0x7ffffffffffff000

/** 统一收敛为「正有限字节数」,其余为 null */
function toPositiveBytes(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * 解析 cgroup v2 CPU 配额(`cpu.max`,形如 `200000 100000` 或 `max 100000`)。
 * 返回配额核数(quota ÷ period);不限或格式不符时返回 null。
 */
export function parseCpuMax(text: string): number | null {
  const [quotaField, periodField] = text.trim().split(/\s+/)
  if (quotaField === undefined || periodField === undefined || quotaField === 'max') return null
  const quota = Number.parseInt(quotaField, 10)
  const period = Number.parseInt(periodField, 10)
  if (!Number.isFinite(quota) || !Number.isFinite(period) || quota <= 0 || period <= 0) return null
  return quota / period
}

/** 解析 cgroup v1 CPU 配额(quota 与 period 分别成文件,负值表示不限) */
export function parseCpuCfsQuota(quotaText: string, periodText: string): number | null {
  const quota = Number.parseInt(quotaText.trim(), 10)
  const period = Number.parseInt(periodText.trim(), 10)
  if (!Number.isFinite(quota) || !Number.isFinite(period) || quota <= 0 || period <= 0) return null
  return quota / period
}

/** 解析 cgroup v2 内存上限(`memory.max`,`max` 表示不限) */
export function parseMemoryMax(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === 'max') return null
  return toPositiveBytes(Number.parseInt(trimmed, 10))
}

/** 解析 cgroup v1 内存上限(`memory.limit_in_bytes`,哨兵值表示不限) */
export function parseMemoryLimit(text: string): number | null {
  const value = Number.parseInt(text.trim(), 10)
  if (!Number.isFinite(value) || value >= V1_UNLIMITED_MEMORY) return null
  return toPositiveBytes(value)
}

/** 读取一个文件的文本(缺失或不可读时返回 null) */
function readText(file: string): string | null {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/**
 * 读取运行环境自身的 cgroup 配额:优先统一层级(v2),其次 v1 根路径。
 * 容器内 `/sys/fs/cgroup` 即该容器的 cgroup 根,故无需解析 `/proc/self/cgroup`;
 * 非 Linux 平台直接返回空配额。
 */
export function readCgroupLimits(root = '/sys/fs/cgroup'): CgroupLimits {
  if (process.platform !== 'linux') return { cpuQuotaCores: null, memoryLimitBytes: null }
  const cpuMax = readText(join(root, 'cpu.max'))
  const cpuQuotaCores =
    cpuMax !== null
      ? parseCpuMax(cpuMax)
      : parseCpuCfsQuota(
          readText(join(root, 'cpu', 'cpu.cfs_quota_us')) ?? '',
          readText(join(root, 'cpu', 'cpu.cfs_period_us')) ?? '',
        )
  const memoryMax = readText(join(root, 'memory.max'))
  const memoryLimitBytes =
    memoryMax !== null
      ? parseMemoryMax(memoryMax)
      : parseMemoryLimit(readText(join(root, 'memory', 'memory.limit_in_bytes')) ?? '')
  return { cpuQuotaCores, memoryLimitBytes }
}
