/*
 * 监控模块数据类型
 *
 * 定义进程句柄、资源样本、原始进程记录、面板快照与汇报回执的规范结构,
 * 结构与格式遵循 docs/v0.1.0-进程汇报机制与规范.md。
 * 作者:JularDepick
 */

/** 进程句柄,用于标识一个可被监控的进程 */
export interface ProcessHandle {
  /** 进程标识(平台进程号) */
  pid: number
  /** 进程可读名称(可选) */
  name?: string
  /** 父进程标识(可选,用于表达树形关系) */
  parentPid?: number
}

/** 进程资源占用样本 */
export interface ResourceSample {
  /** 进程句柄 */
  handle: ProcessHandle
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