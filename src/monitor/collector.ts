/*
 * 进程资源采集器
 *
 * 按轮询间隔采集 dsh 进程树与 Agent 已汇报句柄的资源占用:
 * Windows 经 PowerShell 查询系统进程快照(CIM 为主,Get-Process 为降级),
 * Linux(含 WSL)经 /proc 文件系统读取,macOS 经 ps 读取;
 * CPU 占用率以相邻两次采样的累计 CPU 时间差分计算,
 * 内存换算为 GB 与系统总量百分比。
 * 数据仅供 UI 面板展示,不暴露给 dsh 使用。
 * 作者:JularDepick
 */

import { execFile } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { cpus, totalmem } from 'node:os'
import { join } from 'node:path'
import { LINUX_CLK_TCK, QUERY_TIMEOUT_MS } from '../constants'
import type { MonitorSnapshot, ProcessHandle, ProcessOwner, ProcessRecord, ResourceSample } from './types'

import { resolveClkTck } from './clock-ticks'

/** 系统进程查询器接口(便于注入假实现测试) */
export interface ProcessQuery {
  /** 查询全部系统进程记录,失败时抛出 */
  query(): Promise<ProcessRecord[]>
  /** 最近一次查询是否走降级来源(未查询或首选来源成功时为 false) */
  readonly degraded: boolean
}

/** 执行 PowerShell 脚本并返回输出文本 */
function runPowershell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: QUERY_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout) => {
        if (error) reject(error)
        else resolve(stdout)
      },
    )
  })
}

/** 解析 PowerShell 输出的 JSON 进程列表(单对象时包装为数组) */
function parseRecords(text: string): ProcessRecord[] {
  const data = JSON.parse(text) as unknown
  const list = Array.isArray(data) ? data : [data]
  return list
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .filter((item) => Number.isInteger(item.ProcessId))
    .map((item) => ({
      pid: item.ProcessId as number,
      parentPid: Number.isInteger(item.ParentProcessId) ? (item.ParentProcessId as number) : null,
      name: typeof item.Name === 'string' ? item.Name : String(item.ProcessId),
      cpuSeconds: typeof item.cpu === 'number' && item.cpu > 0 ? item.cpu : 0,
      workingSetBytes: typeof item.WorkingSetSize === 'number' && item.WorkingSetSize > 0 ? item.WorkingSetSize : 0,
    }))
}

/** CIM 主查询:一次取得全量进程的标识、父子关系、累计 CPU 时间与工作集 */
class CimProcessQuery implements ProcessQuery {
  /** 首选来源,不视为降级 */
  readonly degraded = false

  async query(): Promise<ProcessRecord[]> {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      'Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, @{n=\'cpu\';e={($_.UserModeTime + $_.KernelModeTime) / 10000000}}, WorkingSetSize | ConvertTo-Json -Compress',
    ].join('\n')
    return parseRecords(await runPowershell(script))
  }
}

/** 降级查询:Get-Process 全量,无父子关系(父进程标识置空) */
class GetProcessQuery implements ProcessQuery {
  /** 独立使用时即降级来源,由回退链标注整体状态 */
  readonly degraded = true

  async query(): Promise<ProcessRecord[]> {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      "Get-Process | Select-Object @{n='ProcessId';e={$_.Id}}, @{n='ParentProcessId';e={$null}}, Name, @{n='cpu';e={if ($null -eq $_.CPU) { 0 } else { $_.CPU }}}, @{n='WorkingSetSize';e={if ($null -eq $_.WorkingSet64) { 0 } else { $_.WorkingSet64 }}} | ConvertTo-Json -Compress",
    ].join('\n')
    return parseRecords(await runPowershell(script))
  }
}

/** 依次尝试查询器,全部失败时抛出最后一个错误 */
class FallbackProcessQuery implements ProcessQuery {
  /** 最近一次成功查询的索引(未成功为 -1) */
  private lastIndex = -1

  /** 最近一次查询是否走降级来源(首选索引 0 之外均视为降级) */
  get degraded(): boolean {
    return this.lastIndex > 0
  }

  /** 构造回退查询器 */
  constructor(private readonly queries: ProcessQuery[]) {}

  async query(): Promise<ProcessRecord[]> {
    let lastError: unknown
    for (let index = 0; index < this.queries.length; index += 1) {
      const query = this.queries[index]
      try {
        const records = await query.query()
        this.lastIndex = index
        return records
      } catch (error) {
        lastError = error
      }
    }
    throw lastError
  }
}

/** Linux 查询:/proc 文件系统读取(可注入根路径便于测试) */
export class LinuxProcQuery implements ProcessQuery {
  /** 首选来源,不视为降级 */
  readonly degraded = false

  /** 构造 Linux 查询器:时钟节拍默认走探测与缓存(非 Linux 或探测不可信时为常量兜底) */
  constructor(private readonly root = '/proc', private readonly clkTck: number = resolveClkTck(root)) {}

  async query(): Promise<ProcessRecord[]> {
    const records: ProcessRecord[] = []
    for (const entry of readdirSync(this.root)) {
      if (!/^\d+$/.test(entry)) continue
      const pid = Number(entry)
      try {
        records.push(this.readProcess(pid))
      } catch {
        // 单个进程读取失败(权限或退出竞态)时跳过,不中断整体
      }
    }
    return records
  }

  /** 读取单个进程记录 */
  private readProcess(pid: number): ProcessRecord {
    const dir = join(this.root, String(pid))
    const stat = readFileSync(join(dir, 'stat'), 'utf8')
    const nameStart = stat.indexOf('(')
    const nameEnd = stat.lastIndexOf(')')
    const tail = stat.slice(nameEnd + 2).trim().split(/\s+/)
    // tail 自 stat 第 3 字段起:第 4 字段父进程标识、第 14 字段用户态时间、第 15 字段内核态时间
    const parentPid = Number(tail[1])
    const utime = Number(tail[11])
    const stime = Number(tail[12])
    const status = readFileSync(join(dir, 'status'), 'utf8')
    const rssMatch = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status)
    return {
      pid,
      parentPid: Number.isInteger(parentPid) ? parentPid : null,
      name: stat.slice(nameStart + 1, nameEnd).trim() || String(pid),
      cpuSeconds: ((Number.isFinite(utime) ? utime : 0) + (Number.isFinite(stime) ? stime : 0)) / this.clkTck,
      workingSetBytes: rssMatch ? Number(rssMatch[1]) * 1024 : 0,
    }
  }
}

/** 未适配平台占位查询:加载不失败,查询时报错由采集器记录 */
class UnsupportedQuery implements ProcessQuery {
  /** 无降级语义 */
  readonly degraded = false

  /** 构造占位查询器 */
  constructor(private readonly platform: NodeJS.Platform) {}

  async query(): Promise<ProcessRecord[]> {
    throw new Error(`尚未实现:${this.platform} 平台进程采集`)
  }
}

/** 执行 ps 并返回输出文本(macOS 采集) */
function runPs(args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'ps',
      [...args],
      { timeout: QUERY_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout) => {
        if (error) reject(error)
        else resolve(stdout)
      },
    )
  })
}

/** 解析 ps 的累计 CPU 时间字段([[dd-]hh:]mm:ss)为秒 */
function parseCpuSeconds(text: string): number {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(text.trim())
  if (match === null) return 0
  const days = Number(match[1] ?? 0)
  const hours = Number(match[2] ?? 0)
  const minutes = Number(match[3] ?? 0)
  const seconds = Number(match[4] ?? 0)
  return days * 86400 + hours * 3600 + minutes * 60 + seconds
}

/**
 * 解析 macOS ps 输出:字段顺序由调用方给定,名称固定放在最后
 * (进程名可能含空格,故按字段数切开、余下整段作为名称)。
 */
function parsePsRecords(text: string, layout: readonly ('pid' | 'ppid' | 'time' | 'rss')[]): ProcessRecord[] {
  const records: ProcessRecord[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const fields = trimmed.split(/\s+/, layout.length + 1)
    if (fields.length <= layout.length) continue
    const pid = Number(fields[0])
    if (!Number.isInteger(pid) || pid <= 0) continue
    let parentPid: number | null = null
    let cpuSeconds = 0
    let workingSetBytes = 0
    layout.forEach((field, index) => {
      const value = fields[index]
      if (field === 'ppid') {
        const parsed = Number(value)
        parentPid = Number.isInteger(parsed) && parsed > 0 ? parsed : null
      } else if (field === 'time') {
        cpuSeconds = parseCpuSeconds(value)
      } else if (field === 'rss') {
        const kb = Number(value)
        workingSetBytes = Number.isFinite(kb) && kb > 0 ? kb * 1024 : 0
      }
    })
    records.push({
      pid,
      parentPid,
      name: fields[layout.length].trim() || String(pid),
      cpuSeconds,
      workingSetBytes,
    })
  }
  return records
}

/** macOS 查询:ps 全量进程(含父子关系、累计 CPU 时间与常驻内存) */
export class MacPsQuery implements ProcessQuery {
  /** 首选来源,不视为降级 */
  readonly degraded = false

  async query(): Promise<ProcessRecord[]> {
    return parsePsRecords(await runPs(['-axo', 'pid=,ppid=,time=,rss=,comm=']), ['pid', 'ppid', 'time', 'rss'])
  }
}

/** macOS 降级查询:ps 去父子关系与累计 CPU 时间(父进程置空、CPU 时间置零,由回退链标注降级) */
export class MacPsSimpleQuery implements ProcessQuery {
  /** 独立使用时即降级来源 */
  readonly degraded = true

  async query(): Promise<ProcessRecord[]> {
    return parsePsRecords(await runPs(['-axo', 'pid=,rss=,comm=']), ['pid', 'rss'])
  }
}

/** 按运行时平台创建查询链:Windows 用 PowerShell 回退链,Linux(含 WSL)用 /proc,macOS 用 ps,其余平台占位 */
export function createPlatformQuery(): ProcessQuery {
  switch (process.platform) {
    case 'win32':
      return new FallbackProcessQuery([new CimProcessQuery(), new GetProcessQuery()])
    case 'linux':
      return new LinuxProcQuery()
    case 'darwin':
      return new FallbackProcessQuery([new MacPsQuery(), new MacPsSimpleQuery()])
    default:
      return new UnsupportedQuery(process.platform)
  }
}

/** 操作系统显示名(Linux 识别发行版与版本) */
export function resolvePlatformLabel(): string {
  if (process.platform === 'win32') return 'Windows'
  if (process.platform === 'darwin') return 'macOS'
  if (process.platform === 'linux') {
    try {
      const osRelease = readFileSync('/etc/os-release', 'utf8')
      const pretty = /^PRETTY_NAME="?([^"\n]+)"?$/m.exec(osRelease)
      if (pretty) return pretty[1].trim()
      const name = /^NAME="?([^"\n]+)"?$/m.exec(osRelease)
      const version = /^VERSION_ID="?([^"\n]+)"?$/m.exec(osRelease)
      if (name) return version ? `${name[1].trim()} ${version[1].trim()}` : name[1].trim()
    } catch {
      // /etc/os-release 不可读时按通用 Linux 处理
    }
    return 'Linux'
  }
  return process.platform
}

/** 进程资源采集器 */
export class ProcessCollector {
  /** 逻辑处理器数量 */
  private readonly cpuCount = cpus().length
  /** 系统物理内存总量(字节) */
  private readonly totalMemoryBytes = totalmem()
  /** Agent 汇报句柄(按 pid 合并) */
  private readonly reported = new Map<number, ProcessHandle>()
  /** 各 pid 的上一轮累计 CPU 时间(秒) */
  private readonly lastCpu = new Map<number, number>()
  /** 最近一次采样时刻(epoch 毫秒) */
  private lastSampledAt = 0
  /** 首份快照就绪的兑现器(产出首份快照时置空) */
  private firstSampleResolve: (() => void) | null = null
  /** 首份快照就绪信号:数据端点据此等待,避免先返回占位快照 */
  private readonly firstSample = new Promise<void>((resolve) => {
    this.firstSampleResolve = resolve
  })
  /** 最近一次快照(查询失败时保留旧值) */
  private snapshot: MonitorSnapshot | null = null
  /** 最近一次查询失败原因(诊断用) */
  private lastError: string | null = null

  /** 构造采集器 */
  constructor(
    /** 采集轮询间隔(毫秒) */
    public readonly pollInterval: number,
    /** dsh 根进程标识 */
    private readonly rootPid: number,
    /** 系统进程查询器 */
    private readonly query: ProcessQuery = createPlatformQuery(),
    /** 归属解析器:按当前采样进程集合给出「进程 → 会话」归属(缺省时不解析,样本无 owner) */
    private readonly resolveOwners: (pids: readonly number[]) => Map<number, ProcessOwner> = () => new Map(),
    /** 汇报句柄归属同步:句柄并入监控集合时把其会话标注告知归属解析器 */
    private readonly onReported: (handle: ProcessHandle) => void = () => {},
  ) {}

  /** 执行一轮采集,失败不影响既有快照 */
  async poll(): Promise<void> {
    try {
      this.advance(await this.query.query())
      this.lastError = null
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
    }
  }

  /** 以原始记录推进一轮采样(纯逻辑,便于测试) */
  advance(records: ProcessRecord[]): MonitorSnapshot {
    const byPid = new Map<number, ProcessRecord>()
    for (const record of records) byPid.set(record.pid, record)

    // 进程树:自 dsh 根进程按父子关系深度优先
    const children = new Map<number, number[]>()
    for (const record of records) {
      if (record.parentPid === null) continue
      const list = children.get(record.parentPid)
      if (list) list.push(record.pid)
      else children.set(record.parentPid, [record.pid])
    }
    const treePids: number[] = []
    const seen = new Set<number>()
    const visit = (pid: number): void => {
      if (seen.has(pid) || !byPid.has(pid)) return
      seen.add(pid)
      treePids.push(pid)
      for (const child of children.get(pid) ?? []) visit(child)
    }
    visit(this.rootPid)

    // 已退出的汇报句柄移出集合
    for (const pid of this.reported.keys()) {
      if (!byPid.has(pid)) this.reported.delete(pid)
    }

    // 采样集合:进程树在前,树外的汇报句柄按 pid 升序在后
    const order = [...treePids]
    const extraReported = [...this.reported.keys()]
      .filter((pid) => byPid.has(pid) && !seen.has(pid))
      .sort((a, b) => a - b)
    order.push(...extraReported)

    // CPU 差分:全量进程都算(中段样本用 dsh 集合,左端「其他应用」用其余进程合计)
    const now = Date.now()
    const elapsed = this.lastSampledAt === 0 ? 0 : (now - this.lastSampledAt) / 1000
    const cpuPercentByPid = new Map<number, number>()
    for (const record of records) {
      const previous = this.lastCpu.get(record.pid)
      const cpuPercent = previous !== undefined && elapsed > 0 && record.cpuSeconds >= previous
        ? ((record.cpuSeconds - previous) / elapsed / this.cpuCount) * 100
        : 0
      cpuPercentByPid.set(record.pid, cpuPercent)
      this.lastCpu.set(record.pid, record.cpuSeconds)
    }
    // 清理已退出进程的差分基准:避免长期运行后映射无限增长,同时规避 pid 复用带来的错误差分
    for (const pid of [...this.lastCpu.keys()]) {
      if (!byPid.has(pid)) this.lastCpu.delete(pid)
    }

    // 归属解析按本轮采样集合进行(进程树 + 汇报句柄)
    const owners = this.resolveOwners(order)
    const memoryPercentOf = (bytes: number): number =>
      this.totalMemoryBytes > 0 ? (bytes / this.totalMemoryBytes) * 100 : 0
    const processes: ResourceSample[] = order.map((pid) => {
      const record = byPid.get(pid)!
      const reportedHandle = this.reported.get(pid)
      const handle: ProcessHandle = {
        pid,
        name: reportedHandle?.name ?? record.name,
        ...(reportedHandle?.parentPid ?? record.parentPid) === undefined
          ? {}
          : { parentPid: reportedHandle?.parentPid ?? record.parentPid! },
      }
      const owner = owners.get(pid)
      return {
        handle,
        ...(owner === undefined ? {} : { owner }),
        cpuPercent: cpuPercentByPid.get(pid) ?? 0,
        memoryBytes: record.workingSetBytes,
        memoryPercent: memoryPercentOf(record.workingSetBytes),
      }
    })

    // 整机口径:左端「其他应用」为 dsh 集合外全部进程合计,右端「空闲」为整机未被占用部分
    const sampled = new Set(order)
    let othersCpuPercent = 0
    let othersMemoryBytes = 0
    let othersCount = 0
    for (const record of records) {
      if (sampled.has(record.pid)) continue
      othersCpuPercent += cpuPercentByPid.get(record.pid) ?? 0
      othersMemoryBytes += record.workingSetBytes
      othersCount += 1
    }
    const dshCpuPercent = processes.reduce((sum, sample) => sum + sample.cpuPercent, 0)
    const dshMemoryBytes = processes.reduce((sum, sample) => sum + sample.memoryBytes, 0)
    const othersMemoryPercent = memoryPercentOf(othersMemoryBytes)
    this.lastSampledAt = now

    this.snapshot = {
      sampledAt: now,
      pollInterval: this.pollInterval,
      cpuCount: this.cpuCount,
      totalMemoryBytes: this.totalMemoryBytes,
      rootPid: this.rootPid,
      platform: resolvePlatformLabel(),
      degraded: this.query.degraded,
      processes,
      totals: {
        othersCpuPercent,
        othersMemoryBytes,
        othersMemoryPercent,
        othersCount,
        idleCpuPercent: Math.max(0, 100 - othersCpuPercent - dshCpuPercent),
        idleMemoryPercent: Math.max(0, 100 - othersMemoryPercent - memoryPercentOf(dshMemoryBytes)),
      },
    }
    // 首份快照就绪:唤醒等待中的数据端点请求
    this.firstSampleResolve?.()
    this.firstSampleResolve = null
    return this.snapshot
  }

  /**
   * 等待首份快照就绪(至多 timeoutMs 毫秒)。
   * 数据端点在采集器尚未产出时据此等待,等这一轮计算完成再回答,
   * 避免浏览器端先拿到占位快照而把面板置空;超时返回 null。
   */
  async whenSampled(timeoutMs: number): Promise<MonitorSnapshot | null> {
    if (this.snapshot !== null) return this.snapshot
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.firstSample,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs)
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
    return this.snapshot
  }

  /** 合并 Agent 汇报句柄(重复按 pid 合并,存在性在下一轮采样确认;会话标注转交归属解析器) */
  mergeReported(handles: readonly ProcessHandle[]): void {
    for (const handle of handles) {
      this.reported.set(handle.pid, handle)
      this.onReported(handle)
    }
  }

  /** 获取最近一次面板快照,查询失败时为空 */
  getSnapshot(): MonitorSnapshot | null {
    return this.snapshot
  }

  /** 获取最近一次查询失败原因(无失败时为空) */
  getLastError(): string | null {
    return this.lastError
  }
}