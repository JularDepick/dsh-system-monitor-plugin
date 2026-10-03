/*
 * 插件配置
 *
 * 导出同名 Config 类型与 Schemastery schema,默认值写入 schema,
 * 使无效配置在插件加载期响亮失败。
 */

import Schema from '@deepseek-ai/schemastery'
import {
  DEFAULT_CPU_SCOPE,
  DEFAULT_LANE_COLOR_POOL,
  DEFAULT_LANE_COLOR_STRATEGY,
  MAX_LANE_COLOR_POOL_SIZE,
  MIN_LANE_COLOR_POOL_SIZE,
  DEFAULT_LANE_NAMES,
  DEFAULT_PANEL_COLUMNS,
  DEFAULT_POLL_INTERVAL,
  DEFAULT_RETAIN_ROUNDS,
  MAX_RETAIN_ROUNDS,
  MIN_POLL_INTERVAL,
  MIN_RETAIN_ROUNDS,
} from './constants'
import type { CpuScope, PanelColumns } from './constants'
import type { LaneColorStrategy } from './monitor/lane-colors'

export interface Config {
  /** 资源采集轮询间隔(毫秒,不低于 `MIN_POLL_INTERVAL`) */
  pollInterval: number
  /** 是否在占比条泳道内显示进程/会话名称(关闭后仅保留悬停提示) */
  laneNames: boolean
  /** 面板视图列数:单列或双列(卡片纵向排布或两列并列) */
  columns: PanelColumns
  /** CPU 展示口径:整机或单核(仅影响面板展示换算,采集口径不变) */
  cpuScope: CpuScope
  /**
   * 列表行留存轮数:某身份(进程按名称,会话按会话标识)连续这么多轮没被采样到即从面板移除;
   * 期间该行保留显示但数值归零。范围 `MIN_RETAIN_ROUNDS` 至 `MAX_RETAIN_ROUNDS`。
   */
  retainRounds: number
  /**
   * 泳道预备颜色池:普通进程/会话按顺序取用的颜色,用户可增删改
   * (数量不少于 `MIN_LANE_COLOR_POOL_SIZE`,读取时会归一化并补足)。
   */
  laneColorPool: string[]
  /** 泳道颜色取色方案:循环复用(`cycle`)或自动取间色新增(`midpoint`) */
  laneColorStrategy: LaneColorStrategy
}

export const Config: Schema<Config> = Schema.object({
  pollInterval: Schema.number().min(MIN_POLL_INTERVAL).default(DEFAULT_POLL_INTERVAL),
  laneNames: Schema.boolean().default(DEFAULT_LANE_NAMES),
  columns: Schema.union([1, 2]).default(DEFAULT_PANEL_COLUMNS),
  cpuScope: Schema.union(['machine', 'core']).default(DEFAULT_CPU_SCOPE),
  retainRounds: Schema.number().min(MIN_RETAIN_ROUNDS).max(MAX_RETAIN_ROUNDS).default(DEFAULT_RETAIN_ROUNDS),
  laneColorPool: Schema.array(Schema.string()).default([...DEFAULT_LANE_COLOR_POOL]),
  laneColorStrategy: Schema.union(['cycle', 'midpoint']).default(DEFAULT_LANE_COLOR_STRATEGY),
})