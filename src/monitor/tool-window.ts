/*
 * 工具调用时间窗
 *
 * 面板的趋势线只看得到 CPU 曲线,读不出「这一段是不是正在跑工具」;
 * 这里把会话事件流里的 tool/call 与 tool/result 按调用标识配对成时间窗,
 * 供面板在趋势线上标注(挂在趋势线上,不单独成卡)。
 * 时间取自会话事件自带的 epoch 毫秒(`time`),不另取本地时钟,避免两套时钟错位。
 * 只保留最近若干窗口,不落盘,也不经任何 dsh 通道。
 * 纯逻辑,不含平台与 DOM 依赖,便于回归。
 * 作者:JularDepick
 */

/** 一次工具调用的时间窗 */
export interface ToolWindow {
  /** 工具名 */
  name: string
  /** 调用标识(与 tool/result 配对) */
  callId: string
  /** 开始时刻(epoch 毫秒) */
  startedAt: number
  /** 结束时刻(epoch 毫秒);0 表示尚未结束 */
  endedAt: number
}

/** 固定容量的工具调用时间窗留存(环形语义:超出容量丢弃最旧一项) */
export class ToolWindowLog {
  /** 按开始时刻升序保存的窗口 */
  private readonly windows: ToolWindow[] = []

  /** 尚未结束的调用(调用标识 → 窗口) */
  private readonly pending = new Map<string, ToolWindow>()

  /** 构造留存:容量必须为正整数 */
  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`工具调用留存容量必须为正整数,收到 ${capacity}`)
    }
  }

  /** 当前窗口条数 */
  get size(): number {
    return this.windows.length
  }

  /** 尚未结束的调用数 */
  get pendingCount(): number {
    return this.pending.size
  }

  /** 记录一次工具调用开始(同一调用标识重复上报或时间非法时忽略) */
  begin(callId: string, name: string, startedAt: number): void {
    if (!Number.isFinite(startedAt) || startedAt <= 0) return
    // 同一调用标识只记一次:事件流重放(如会话恢复后重放日志)不产生重复窗口
    if (this.pending.has(callId) || this.windows.some((window) => window.callId === callId)) return
    const window: ToolWindow = { name, callId, startedAt, endedAt: 0 }
    this.windows.push(window)
    this.pending.set(callId, window)
    while (this.windows.length > this.capacity) {
      const dropped = this.windows.shift()
      // 被丢弃的窗口若仍在进行中,其结束事件随之作废,避免 pending 无界增长
      if (dropped !== undefined) this.pending.delete(dropped.callId)
    }
  }

  /** 记录一次工具调用结束(未配对或时间早于开始时刻时忽略) */
  end(callId: string, endedAt: number): void {
    if (!Number.isFinite(endedAt) || endedAt <= 0) return
    const window = this.pending.get(callId)
    if (window === undefined) return
    window.endedAt = Math.max(endedAt, window.startedAt)
    this.pending.delete(callId)
  }

  /** 读取窗口(副本,按开始时刻升序;调用方改动不影响留存) */
  list(): ToolWindow[] {
    return this.windows.map((window) => ({ ...window }))
  }
}

/** 趋势线上的一个标注(横坐标为折线坐标系里的位置) */
export interface ToolMark {
  /** 左边界(折线坐标系) */
  x1: number
  /** 右边界(折线坐标系) */
  x2: number
  /** 是否尚未结束(右边界顶到可视区右端) */
  open: boolean
  /** 工具名(供悬停提示) */
  name: string
}

/**
 * 把工具调用时间窗映射为折线上的标注。
 *
 * 折线按采样点下标等距排布,故先把窗口时刻按采样时刻线性插值成下标,再换算成坐标;
 * 窗口跨越可视区时按可视区截断,尚未结束的窗口右边界顶到右端(便于看出「正在跑工具」)。
 * 过短的窗口给 `minWidth` 的最小可见宽度,避免短调用在图上完全看不见。
 * 采样点不足两点或尺寸非法时返回空数组。
 */
export function toolWindowMarks(
  windows: readonly ToolWindow[],
  points: readonly { sampledAt: number }[],
  width: number,
  minWidth = 0.6,
): ToolMark[] {
  if (points.length < 2 || !Number.isFinite(width) || width <= 0) return []
  const first = points[0].sampledAt
  const last = points[points.length - 1].sampledAt
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return []
  const span = points.length - 1
  /** 时刻 → 折线坐标(超出可视区按端点截断) */
  const position = (time: number): number => {
    const clamped = Math.min(Math.max(time, first), last)
    let index = span
    for (let i = 0; i < span; i += 1) {
      const left = points[i].sampledAt
      const right = points[i + 1].sampledAt
      if (clamped <= right) {
        const step = right - left
        index = step > 0 ? i + (clamped - left) / step : i
        break
      }
    }
    return Math.round((index / span) * width * 100) / 100
  }

  const marks: ToolMark[] = []
  for (const window of windows) {
    if (!Number.isFinite(window.startedAt) || window.startedAt <= 0) continue
    const open = !Number.isFinite(window.endedAt) || window.endedAt <= 0
    const end = open ? last : Math.min(window.endedAt, last)
    if (end < first) continue
    if (window.startedAt > last && !open) continue
    const x1 = position(Math.max(window.startedAt, first))
    const rawX2 = position(end)
    const x2 = Math.max(rawX2, x1 + minWidth)
    marks.push({ x1, x2: Math.round(Math.min(x2, width) * 100) / 100, open, name: window.name })
  }
  return marks
}
