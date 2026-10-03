/*
 * 表格排序
 *
 * 面板明细表默认按采集顺序(进程树顺序/会话分组顺序)展示,读不出「谁最占资源」;
 * 这里提供按 CPU,内存或名称排序的通用稳定排序,供面板四张卡共用。
 * 固定行(宿主在最前,未归因在最后)不参与排序比较,保持其语义位置。
 * 纯逻辑,不含 DOM 依赖,便于回归。
 * 作者:JularDepick
 */

/** 表格排序方式(默认保留采集顺序) */
export type TableSort = 'default' | 'cpu' | 'memory' | 'name'

/** 全部排序方式(配置面校验与遍历用) */
export const TABLE_SORTS: readonly TableSort[] = ['default', 'cpu', 'memory', 'name']

/** 归一化排序取值(未知取值退回默认) */
export function normalizeTableSort(value: unknown): TableSort {
  return typeof value === 'string' && (TABLE_SORTS as readonly string[]).includes(value)
    ? (value as TableSort)
    : 'default'
}

/**
 * 稳定排序:先按固定位次(数值小者在前,缺省视为 0),再按比较函数,最后按原有下标。
 * 比较函数返回 0 时保持原有相对顺序,故「权重相同」的行不会在每轮刷新时抖动。
 */
export function sortRows<T>(
  rows: readonly T[],
  compare: (a: T, b: T) => number,
  pinned: (row: T) => number = () => 0,
): T[] {
  return rows
    .map((row, index) => ({ row, index, rank: pinned(row) }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank
      const compared = compare(a.row, b.row)
      if (compared !== 0) return compared
      return a.index - b.index
    })
    .map((entry) => entry.row)
}
