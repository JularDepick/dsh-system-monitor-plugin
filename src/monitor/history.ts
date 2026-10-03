/*
 * 采样留存(短期趋势)
 *
 * 面板此前只有瞬时快照,读不出「刚刚是否冲高」;
 * 这里保留最近若干轮采样的整机口径百分比,供面板画一条短期趋势线。
 * 留存固定容量(超出即丢最旧),不做落盘、不写状态文件,也不经任何 dsh 通道。
 * 作者:JularDepick
 */

/** 单个留存点(整机口径百分比,与快照合计同源) */
export interface HistoryPoint {
  /** 采样时刻(epoch 毫秒) */
  sampledAt: number
  /** dsh 及其子进程 CPU 合计(占整机百分比) */
  dshCpuPercent: number
  /** 其他应用 CPU 合计(占整机百分比) */
  othersCpuPercent: number
  /** dsh 及其子进程内存合计(占整机百分比) */
  dshMemoryPercent: number
}

/** 固定容量的采样留存(环形语义:超出容量丢弃最旧的一项) */
export class SampleHistory {
  /** 按时间升序保存的留存点 */
  private readonly points: HistoryPoint[] = []

  /** 构造留存:容量必须为正整数 */
  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`采样留存容量必须为正整数,收到 ${capacity}`)
    }
  }

  /** 当前留存条数 */
  get size(): number {
    return this.points.length
  }

  /** 追加一个留存点(超出容量时丢弃最旧项) */
  push(point: HistoryPoint): void {
    this.points.push(point)
    while (this.points.length > this.capacity) this.points.shift()
  }

  /** 读取留存点(副本,调用方改动不影响留存) */
  list(): HistoryPoint[] {
    return [...this.points]
  }
}

/** 保留两位小数(避免 SVG 坐标出现长尾小数) */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * 把留存点映射为 SVG 折线的坐标串(导出以便纯函数回归)。
 *
 * x 按序号等分(轮询间隔由采集侧保证近似均匀,不按真实时刻拉伸),
 * y 由百分比线性映射(值越大越靠上,`maxPercent` 处为顶边);
 * 超出上限的值按上限截断,负值按零处理。点数不足两点或尺寸非法时返回空串,
 * 由调用方按「单点画圆点、无点显示空态」处理。
 */
export function historyPolyline(
  points: readonly HistoryPoint[],
  width: number,
  height: number,
  maxPercent = 100,
): string {
  if (points.length < 2 || width <= 0 || height <= 0 || maxPercent <= 0) return ''
  const step = width / (points.length - 1)
  return points
    .map((point, index) => {
      const ratio = Math.min(1, Math.max(0, point.dshCpuPercent / maxPercent))
      return `${round2(index * step)},${round2(height - ratio * height)}`
    })
    .join(' ')
}

/** 留存窗口的统计摘要(整机口径百分比;无留存点时返回 null) */
export function historySummary(
  points: readonly HistoryPoint[],
): { dshCpuAvg: number; dshCpuPeak: number; dshMemoryPeak: number } | null {
  if (points.length === 0) return null
  let cpuSum = 0
  let cpuPeak = 0
  let memoryPeak = 0
  for (const point of points) {
    cpuSum += point.dshCpuPercent
    cpuPeak = Math.max(cpuPeak, point.dshCpuPercent)
    memoryPeak = Math.max(memoryPeak, point.dshMemoryPercent)
  }
  return { dshCpuAvg: cpuSum / points.length, dshCpuPeak: cpuPeak, dshMemoryPeak: memoryPeak }
}
