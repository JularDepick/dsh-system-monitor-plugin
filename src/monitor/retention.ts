/*
 * 列表行留存(粘性行)
 *
 * 面板列表默认只显示本轮采样到的成员;启用留存后:
 *  - 采样过的身份在后续某轮没采样到时不移除,该行以零值继续显示;
 *  - 连续未采样达到阈值(默认 10 轮,配置范围 5 至 60)才从列表移除;
 *  - 允许用户手动移除一行,手动移除不记录到任何地方(不写本地存储,也不写服务端);
 *    该身份再次被采样到时自动补回。
 * 身份口径:进程按进程名称,会话按会话标识;同一身份可能对应多行(同名多进程),
 * 故输入同时给出身份键与行键,零值行按身份聚合,代表行取权重最大者。
 * 本模块为纯逻辑,不含平台与 DOM 依赖,便于回归测试。
 * 作者:JularDepick
 */

/** 留存层的一行输入 */
export interface RetentionInput<T> {
  /** 粘性身份键(进程按名称,会话按会话标识) */
  key: string
  /** 行键(进程为 pid,会话为会话标识;仅用于区分同一身份下的多行) */
  rowKey: string
  /** 行负载(渲染用;零值行沿用该身份最近一次采样到的负载) */
  row: T
  /** 代表行权重(同身份多行时取最大者作零值行的代表行) */
  weight: number
}

/** 留存层的一行输出 */
export interface RetainedRow<T> {
  /** 行负载 */
  row: T
  /** 本轮是否采样到(为假表示本轮未采样,调用方应按零值渲染该行) */
  sampled: boolean
}

/** 固定身份集合的行留存 */
export class RowRetention<T> {
  /** 身份键 → 最近一次采样到的代表行与连续未采样轮数 */
  private readonly entries = new Map<string, { row: T; misses: number }>()

  /** 被手动移除的身份(仅内存;该身份再次采样到时自动清除) */
  private readonly removed = new Set<string>()

  /** 构造留存:轮数必须为正整数(配置面另有 5 至 60 的范围校验) */
  constructor(public retainRounds: number) {
    if (!Number.isInteger(retainRounds) || retainRounds < 1) {
      throw new Error(`行留存轮数必须为正整数,收到 ${retainRounds}`)
    }
  }

  /** 当前留存的身份数(诊断与测试用) */
  get size(): number {
    return this.entries.size
  }

  /** 某身份是否处于手动移除状态(诊断与测试用) */
  isRemoved(key: string): boolean {
    return this.removed.has(key)
  }

  /**
   * 推进一轮,返回本轮应显示的行:
   * 本轮采样到的行在前(保持传入顺序),未采样的零值行按身份首次出现顺序在后;
   * 未采样行连续达到 `retainRounds` 轮即从留存中移除。
   */
  advance(current: readonly RetentionInput<T>[]): RetainedRow<T>[] {
    const present = new Set<string>()
    const representative = new Map<string, RetentionInput<T>>()
    for (const item of current) {
      present.add(item.key)
      // 再次采样到即补回:手动移除状态与未采样计数一并清除
      this.removed.delete(item.key)
      const best = representative.get(item.key)
      if (best === undefined || item.weight > best.weight) representative.set(item.key, item)
    }
    for (const [key, item] of representative) this.entries.set(key, { row: item.row, misses: 0 })
    for (const [key, entry] of [...this.entries]) {
      if (present.has(key)) continue
      entry.misses += 1
      if (entry.misses >= this.retainRounds) this.entries.delete(key)
    }

    const rows: RetainedRow<T>[] = []
    for (const item of current) {
      if (this.removed.has(item.key)) continue
      rows.push({ row: item.row, sampled: true })
    }
    for (const [key, entry] of this.entries) {
      if (present.has(key) || this.removed.has(key)) continue
      rows.push({ row: entry.row, sampled: false })
    }
    return rows
  }

  /** 手动移除一个身份(不持久化;该身份再次被采样到时自动补回) */
  remove(key: string): void {
    this.removed.add(key)
    this.entries.delete(key)
  }
}
