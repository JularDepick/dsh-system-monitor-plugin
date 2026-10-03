/*
 * Linux 时钟节拍(CLK_TCK)探测与缓存
 *
 * /proc 的时间字段按用户态 ABI 常量 USER_HZ 计,主流架构为 100,异构内核可能取别的值。
 * 首次运行时探测一次并缓存到 DSH_HOME 下的插件状态文件,后续运行直接复用,不再探测;
 * 缓存不进插件 Config schema,因此宿主设置面板不会出现该项;探测异常时不写盘,下次启动重试。
 * 状态文件同时保留最近若干次探测的诊断记录,便于异构内核环境下排查反复探测的差异。
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  CLK_TCK_CACHE_VERSION,
  CLK_TCK_MAX,
  CLK_TCK_MIN,
  CLK_TCK_PROBE_HISTORY_MAX,
  CLK_TCK_PROBE_MIN_UPTIME_SECONDS,
  CLK_TCK_PROBE_TOLERANCE,
  ENV_CACHE_DIR,
  ENV_CACHE_FILE,
  LINUX_CLK_TCK,
  QUERY_TIMEOUT_MS,
} from '../constants'

/** 单次探测的诊断记录(仅供人工排查,不参与取值) */
export interface ClkTckProbe {
  /** 探测时刻(ISO 字符串) */
  at: string
  /** 运行平台标识 */
  platform: string
  /** 系统标准接口的结果(缺失或失败为 null) */
  getconf: number | null
  /** 由 /proc 推算的结果(失败为 null) */
  derived: number | null
  /** 两法偏差是否超过容差 */
  mismatch: boolean
  /** 本次采信并写入的节拍值 */
  value: number
}

/** 缓存文件内容(clkTck 为插件读取项,probes 仅供人工诊断) */
interface ClkTckCache {
  /** 缓存格式版本,与常量不一致的旧缓存一律作废 */
  version: number
  clkTck: number
  /** 最近若干次探测的诊断记录(旧值在前) */
  probes: ClkTckProbe[]
}

/**
 * 追加一条探测历史并截断到上限(导出以便纯函数测试)。
 * 返回新数组且不修改入参;上限用于避免状态文件随反复探测无限增长。
 */
export function appendProbeHistory(
  existing: readonly ClkTckProbe[] | undefined,
  entry: ClkTckProbe,
  max: number = CLK_TCK_PROBE_HISTORY_MAX,
): ClkTckProbe[] {
  const limit = Math.max(0, max)
  const keepCount = Math.max(0, limit - 1)
  const previous = Array.isArray(existing) ? existing : []
  const kept = keepCount === 0 ? [] : previous.slice(-keepCount)
  return limit === 0 ? [] : [...kept, entry]
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

/** 读取状态文件原始内容(缺失或损坏时为 null) */
function readCache(): Partial<ClkTckCache> | null {
  try {
    const parsed = JSON.parse(readFileSync(clockTicksCacheFile(), 'utf8')) as Partial<ClkTckCache>
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

/** 取出可复用的节拍值(结构版本一致且值可信时才返回,否则返回 null 由调用方重新探测) */
function usableClkTck(raw: Partial<ClkTckCache> | null): number | null {
  if (raw === null || raw.version !== CLK_TCK_CACHE_VERSION || !isPlausibleClkTck(raw.clkTck)) return null
  return raw.clkTck
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
 * 探测法二(导出以便纯函数测试):用 /proc/stat 的处理器累计节拍除以 /proc/uptime 推算节拍数。
 *
 * 时间字段单位必须按**单个处理器**的节拍口径算:每个核各自按 USER_HZ 累加(空闲时也在累加),
 * 故任取一个 `cpuN` 行除以墙钟开机时长即得 USER_HZ。
 * 注意 `/proc/stat` 首行 `cpu` 是全部 `cpuN` 行的**合计**,直接除以 uptime 会得到 `USER_HZ × 核数`
 * (多核机器上数值偏大数倍,会让 CPU 占用率同比例偏小),故合计行只作为单核行缺失时的兜底,
 * 且必须按 `cpuN` 行数摊平。该推算与实际读取的字段同源,故两法不一致时采信它。
 */
export function probeDerived(root: string): number | null {
  try {
    const uptimeText = readFileSync(join(root, 'uptime'), 'utf8').split(/\s+/)[0] ?? ''
    const uptime = Number.parseFloat(uptimeText)
    if (!Number.isFinite(uptime) || uptime < CLK_TCK_PROBE_MIN_UPTIME_SECONDS) return null

    const lines = readFileSync(join(root, 'stat'), 'utf8').split('\n')
    const jiffiesOf = (line: string): number =>
      line
        .trim()
        .split(/\s+/)
        .slice(1)
        .reduce((sum, field) => sum + (Number.parseInt(field, 10) || 0), 0)

    const perCpuLines = lines.filter((line) => /^cpu\d+\s/.test(line))
    if (perCpuLines.length === 0) return null
    let jiffies = jiffiesOf(perCpuLines[0])
    if (jiffies <= 0) {
      // 单核行读不出数值时退回合计行:合计是全部核之和,须按核数摊平
      const totalLine = lines.find((line) => line.startsWith('cpu '))
      jiffies = totalLine === undefined ? 0 : jiffiesOf(totalLine) / perCpuLines.length
    }
    if (jiffies <= 0) return null
    return Math.round((jiffies / uptime) * 100) / 100
  } catch {
    return null
  }
}

/**
 * 取得本环境的时钟节拍数:缓存命中直接复用,否则探测一次并校验后再写盘。
 * 非 Linux 平台与探测不可信时返回常量兜底值(且不写盘,下次启动重试);
 * 写盘时把本次探测追加进历史,历史只在同结构旧文件可读时续写(结构版本变化会作废旧文件)。
 */
export function resolveClkTck(root = '/proc'): number {
  if (process.platform !== 'linux') return LINUX_CLK_TCK
  const raw = readCache()
  const cached = usableClkTck(raw)
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
    version: CLK_TCK_CACHE_VERSION,
    clkTck: value,
    probes: appendProbeHistory(raw?.probes, {
      at: new Date().toISOString(),
      platform: process.platform,
      getconf,
      derived,
      mismatch,
      value,
    }),
  })
  return value
}
