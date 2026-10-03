/*
 * Linux 时钟节拍(CLK_TCK)探测与缓存
 *
 * /proc 的时间字段按用户态 ABI 常量 USER_HZ 计,主流架构为 100,异构内核可能取别的值。
 * 首次运行时探测一次并缓存到 DSH_HOME 下的插件状态文件,后续运行直接复用,不再探测;
 * 缓存不进插件 Config schema,因此宿主设置面板不会出现该项;探测异常时不写盘,下次启动重试。
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  CLK_TCK_MAX,
  CLK_TCK_MIN,
  CLK_TCK_PROBE_MIN_UPTIME_SECONDS,
  CLK_TCK_PROBE_TOLERANCE,
  ENV_CACHE_DIR,
  ENV_CACHE_FILE,
  LINUX_CLK_TCK,
  QUERY_TIMEOUT_MS,
} from '../constants'

/** 缓存文件内容(clkTck 为插件读取项,probe 仅供人工诊断) */
interface ClkTckCache {
  clkTck: number
  probe?: Record<string, unknown>
}

/** 缓存文件绝对路径:DSH_HOME 优先,缺失时退化到 ~/.dsh */
export function clockTicksCacheFile(): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, ENV_CACHE_DIR, ENV_CACHE_FILE)
}

/** 判定节拍值是否可信:正整数且在可信区间内(不按高低卡,只看区间与自洽性) */
function isPlausibleClkTck(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= CLK_TCK_MIN && value <= CLK_TCK_MAX
}

/** 读取缓存中的节拍值(缺失或不可信时返回 null) */
function readCachedClkTck(): number | null {
  try {
    const parsed = JSON.parse(readFileSync(clockTicksCacheFile(), 'utf8')) as ClkTckCache
    return isPlausibleClkTck(parsed.clkTck) ? parsed.clkTck : null
  } catch {
    return null
  }
}

/** 写入缓存(尽力而为:目录不可写时静默,仅影响下次是否重新探测) */
function writeCache(cache: ClkTckCache): void {
  try {
    const file = clockTicksCacheFile()
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
  } catch {
    // 状态文件不可写时忽略:本次运行仍使用探测值
  }
}

/** 探测法一:getconf CLK_TCK(POSIX 标准接口,精确;缺失或失败返回 null) */
function probeGetconf(): number | null {
  try {
    const output = execFileSync('getconf', ['CLK_TCK'], { timeout: QUERY_TIMEOUT_MS, encoding: 'utf8' })
    const value = Number.parseInt(output.trim(), 10)
    return Number.isInteger(value) ? value : null
  } catch {
    return null
  }
}

/**
 * 探测法二:用 /proc/stat 的 CPU 总 jiffies 除以 /proc/uptime 推算节拍数。
 * 与实际读取的字段同源,故两者不一致时采信它;开机时间过短时误差大,直接跳过。
 */
function probeDerived(root: string): number | null {
  try {
    const uptimeText = readFileSync(join(root, 'uptime'), 'utf8').split(/\s+/)[0] ?? ''
    const uptime = Number.parseFloat(uptimeText)
    if (!Number.isFinite(uptime) || uptime < CLK_TCK_PROBE_MIN_UPTIME_SECONDS) return null
    const cpuLine = readFileSync(join(root, 'stat'), 'utf8')
      .split('\n')
      .find((line) => line.startsWith('cpu '))
    if (cpuLine === undefined) return null
    const jiffies = cpuLine
      .trim()
      .split(/\s+/)
      .slice(1)
      .reduce((sum, field) => sum + (Number.parseInt(field, 10) || 0), 0)
    if (jiffies <= 0) return null
    return Math.round((jiffies / uptime) * 100) / 100
  } catch {
    return null
  }
}

/**
 * 取得本环境的时钟节拍数:缓存命中直接复用,否则探测一次并校验后再写盘。
 * 非 Linux 平台与探测不可信时返回常量兜底值(且不写盘,下次启动重试)。
 */
export function resolveClkTck(root = '/proc'): number {
  if (process.platform !== 'linux') return LINUX_CLK_TCK
  const cached = readCachedClkTck()
  if (cached !== null) return cached

  const getconf = probeGetconf()
  const derived = probeDerived(root)
  const mismatch = getconf !== null && derived !== null && Math.abs(getconf - derived) / derived > CLK_TCK_PROBE_TOLERANCE
  let value: number | null = null
  if (mismatch && derived !== null) value = Math.round(derived)
  else if (getconf !== null) value = getconf
  else if (derived !== null) value = Math.round(derived)

  if (!isPlausibleClkTck(value)) return LINUX_CLK_TCK
  writeCache({
    clkTck: value,
    probe: {
      getconf,
      derived,
      mismatch,
      platform: process.platform,
      at: new Date().toISOString(),
    },
  })
  return value
}
