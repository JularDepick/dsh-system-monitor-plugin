/*
 * 展示格式化(百分比)
 *
 * 百分比一律精确到 0.01%;小于 `PERCENT_DISPLAY_FLOOR` 的读数显示为 `<0.01%`,
 * 而不是 `0.00%`,以免把「有占用但极小」与「确实为零」都读成零。
 * 纯函数,不含 DOM 依赖,便于回归测试。
 * 作者:JularDepick
 */

import { PERCENT_DISPLAY_FLOOR } from '../constants'

/** 非数值时的占位文本(正常路径不会出现) */
const PERCENT_FALLBACK = '--'

/**
 * 百分比字符串:精确到 0.01%;低于展示下限时给出 `<0.01%`。
 * 非有限值(非数,无穷)给占位文本,不产生 `NaN%` 这类读数。
 */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return PERCENT_FALLBACK
  if (value < PERCENT_DISPLAY_FLOOR) return `<${PERCENT_DISPLAY_FLOOR.toFixed(2)}%`
  return `${value.toFixed(2)}%`
}
