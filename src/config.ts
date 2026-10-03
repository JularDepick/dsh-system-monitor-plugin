/*
 * 插件配置
 *
 * 导出同名 Config 类型与 Schemastery schema,默认值写入 schema,
 * 使无效配置在插件加载期响亮失败。
 */

import Schema from '@deepseek-ai/schemastery'
import { DEFAULT_LANE_NAMES, DEFAULT_PANEL_COLUMNS, DEFAULT_POLL_INTERVAL } from './constants'
import type { PanelColumns } from './constants'

export interface Config {
  /** 资源采集轮询间隔(毫秒) */
  pollInterval: number
  /** 是否在占比条泳道内显示进程/对话名称(关闭后仅保留悬停提示) */
  laneNames: boolean
  /** 面板视图列数:单列或双列(卡片纵向排布或两列并列) */
  columns: PanelColumns
}

export const Config: Schema<Config> = Schema.object({
  pollInterval: Schema.number().default(DEFAULT_POLL_INTERVAL),
  laneNames: Schema.boolean().default(DEFAULT_LANE_NAMES),
  columns: Schema.union([1, 2]).default(DEFAULT_PANEL_COLUMNS),
})