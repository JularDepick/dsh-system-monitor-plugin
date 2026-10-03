/*
 * 插件配置
 *
 * 导出同名 Config 类型与 Schemastery schema,默认值写入 schema,
 * 使无效配置在插件加载期响亮失败。
 */

import Schema from '@deepseek-ai/schemastery'
import { DEFAULT_LANE_NAMES, DEFAULT_POLL_INTERVAL } from './constants'

export interface Config {
  /** 资源采集轮询间隔(毫秒) */
  pollInterval: number
  /** 是否在占比条泳道内显示进程/对话名称(关闭后仅保留悬停提示) */
  laneNames: boolean
}

export const Config: Schema<Config> = Schema.object({
  pollInterval: Schema.number().default(DEFAULT_POLL_INTERVAL),
  laneNames: Schema.boolean().default(DEFAULT_LANE_NAMES),
})