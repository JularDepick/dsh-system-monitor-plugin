/*
 * 监控模块数据类型
 *
 * 定义进程句柄、资源样本、原始进程记录、面板快照与汇报回执的规范结构,
 * 结构与格式遵循 docs/v0.1.0-进程汇报机制与规范.md。
 * 作者:JularDepick
 */

import type { PanelColumns } from '../constants'

/** 进程句柄,用于标识一个可被监控的进程 */
export interface ProcessHandle {
  /** 进程标识(平台进程号) */
  pid: number
  /** 进程可读名称(可选) */
  name?: string
  /** 父进程标识(可选,用于表达树形关系) */
  parentPid?: number
  /** 所属会话标识(可选,由 Agent 汇报时显式标注,用于对话维度分组) */
  sessionId?: string
}

/**
 * 进程归属:标识该进程属于哪个对话(会话)。
 * 归属来源见 `attribution.ts`(子进程环境、终端 pid 映射、Agent 汇报),
 * 仅用于面板分组展示,不改变资源采样口径。
 */
export interface ProcessOwner {
  /** 会话标识(对话维度分组键) */
  sessionId: string
  /** 会话显示名(宿主会话标题;缺失时面板显示会话标识) */
  label?: string
  /** 是否由子会话(subagent)派生 */
  subagent?: boolean
}

/** 进程资源占用样本 */
export interface ResourceSample {
  /** 进程句柄 */
  handle: ProcessHandle
  /** 资源归属(缺失表示未归因,由面板归入宿主/未归因组) */
  owner?: ProcessOwner
  /** CPU 占用率(百分比) */
  cpuPercent: number
  /** 内存占用(字节) */
  memoryBytes: number
  /** 内存占用(百分比) */
  memoryPercent: number
}

/** Agent 汇报进程句柄的请求 */
export interface ReportRequest {
  /** 待监控的进程句柄列表 */
  handles: ProcessHandle[]
}

/** 系统进程快照中的一条原始进程记录 */
export interface ProcessRecord {
  /** 进程标识 */
  pid: number
  /** 父进程标识(平台未提供时为 null) */
  parentPid: number | null
  /** 进程名称 */
  name: string
  /** 累计 CPU 时间(秒) */
  cpuSeconds: number
  /** 工作集内存占用(字节) */
  workingSetBytes: number
}

/**
 * 整机资源合计(占比条左右两端用)。
 * 「其他应用」为与 dsh 无关的系统进程合计,「空闲」为整机未被占用的部分;
 * 所有百分比均相对整机资源(CPU 为占用率百分比,内存为占物理内存百分比)。
 */
export interface MachineTotals {
  /** 与 dsh 无关的系统进程 CPU 合计(占整机百分比) */
  othersCpuPercent: number
  /** 与 dsh 无关的系统进程内存合计(字节) */
  othersMemoryBytes: number
  /** 与 dsh 无关的系统进程内存合计(占整机百分比) */
  othersMemoryPercent: number
  /** 与 dsh 无关的系统进程数 */
  othersCount: number
  /** 整机未被占用的 CPU(占整机百分比) */
  idleCpuPercent: number
  /** 整机未被占用的内存(占整机百分比) */
  idleMemoryPercent: number
}

/**
 * 面板展示选项(由插件配置投影给客户端,供面板按时下发展示)。
 * 配置改动经宿主设置页写回插件配置后,随下一次轮询的载荷生效。
 */
export interface PanelOptions {
  /** 是否在占比条泳道内显示进程/对话名称(关闭后仅保留悬停提示) */
  laneNames: boolean
  /** 面板视图列数:单列或双列 */
  columns: PanelColumns
}

/** 面板展示快照 */
export interface MonitorSnapshot {
  /** 采样时刻(epoch 毫秒) */
  sampledAt: number
  /** 采集轮询间隔(毫秒) */
  pollInterval: number
  /** 逻辑处理器数量 */
  cpuCount: number
  /** 系统物理内存总量(字节) */
  totalMemoryBytes: number
  /** dsh 根进程标识 */
  rootPid: number
  /** 采集器运行平台(process.platform) */
  platform: string
  /** 最近一次查询是否降级(数据来源非首选,如缺少父子关系) */
  degraded: boolean
  /** 被监控进程的资源样本(进程树在前,汇报句柄在后) */
  processes: ResourceSample[]
  /** 整机口径合计(其他应用与空闲),占整机百分比 */
  totals: MachineTotals
  /** 面板展示选项(泳道内名称开关等;缺失时客户端按默认值处理) */
  panelOptions?: PanelOptions
  /**
   * 无采样时的失败原因(仅数据端点在采集器尚未产出快照时携带)。
   * 携带该项即表示 `sampledAt` 为 0、其余指标均为占位值,面板不得当作有效数据展示。
   */
  error?: string
}

/** 汇报工具回执 */
export interface ReportReceipt {
  /** 已纳入监控的句柄数量 */
  accepted: number
  /** 拒绝明细 */
  rejected: { pid: number; reason: string }[]
  /** 汇总说明 */
  message: string
}