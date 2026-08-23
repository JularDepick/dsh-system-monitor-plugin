/*
 * 插件配置
 *
 * 导出同名 Config 类型与 Schemastery schema,默认值写入 schema,
 * 使无效配置在插件加载期响亮失败。
 */

import Schema from '@deepseek-ai/schemastery'
import { DEFAULT_POLL_INTERVAL } from './constants'

export interface Config {
  /** 资源采集轮询间隔(毫秒) */
  pollInterval: number
}

export const Config: Schema<Config> = Schema.object({
  pollInterval: Schema.number().default(DEFAULT_POLL_INTERVAL),
})