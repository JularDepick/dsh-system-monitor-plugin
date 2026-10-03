/*
 * 展示格式化(百分比)
 *
 * 三档读数,把「确实为零」与「有占用但极小」区分开:
 *   确切 0   -> `0%`(真零,是已知值:该窗口内确实没有占用)
 *   0 与下限之间 -> `<0.01%`(小于可显示精度,不能读成零)
 *   下限及以上   -> 两位小数原值(如 `0.01%`,`12.34%`)
 * 纯函数,不含 DOM 依赖,便于回归测试。
 * 作者:JularDepick
 */

import { PERCENT_DISPLAY_FLOOR } from '../constants'

/** 非数值时的占位文本(正常路径不会出现) */
const PERCENT_FALLBACK = '--'

/**
 * 百分比字符串:确切 0 给 `0%`,低于展示下限给 `<0.01%`,其余按两位小数。
 * 非有限值(非数,无穷)给占位文本,不产生 `NaN%` 这类读数。
 */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return PERCENT_FALLBACK
  if (value === 0) return '0%'
  if (value < PERCENT_DISPLAY_FLOOR) return `<${PERCENT_DISPLAY_FLOOR.toFixed(2)}%`
  return `${value.toFixed(2)}%`
}
