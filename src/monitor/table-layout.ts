/*
 * 表格列宽分配(纯函数)
 *
 * 规则:
 *   1. 内容自适应列先按各自内容宽度挤满(内容宽度由调用方算出,已含列宽下限);
 *   2. 表格宽度有富余时,富余按各列内容宽度比例分给所有自适应列(不被单列独吞);
 *   3. 内容挤不下时,自适应列按比例压缩到可用宽度;
 *   4. 固定宽列(fixedWidth)全程不参与分配:先从可用宽度里扣除,自身宽度恒等于声明值。
 * 返回顺序与传入列顺序一致,可直接用于生成 colgroup。
 * 纯函数,不含 DOM 依赖,便于回归测试。
 * 作者:JularDepick
 */

/** 参与列宽分配的最小列描述(客户端的列定义在结构上满足该形状) */
export interface TableColumnLayout {
  /** 内容自适应宽度(像素,含列宽下限) */
  contentWidth: number
  /** 固定列宽(像素):给了该值即不参与分配,自身宽度恒定 */
  fixedWidth?: number
}

/** 自适应列的列宽分配:先按内容挤满,再把富余按各列内容比例分配 */
export function distributeColumnWidths(contents: readonly number[], tableWidth: number): number[] {
  const total = contents.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return contents.map(() => 0)
  const factor = tableWidth <= 0 || tableWidth <= total ? (tableWidth <= 0 ? 1 : tableWidth / total) : 0
  if (factor > 0) return contents.map((value) => value * factor)
  return contents.map((value) => value + ((tableWidth - total) * value) / total)
}

/** 表格整体列宽:固定宽列先从可用宽度里扣除,其余列再按内容比例分配 */
export function layoutColumnWidths(columns: readonly TableColumnLayout[], tableWidth: number): number[] {
  const flexible: number[] = []
  const positions: number[] = []
  let fixed = 0
  columns.forEach((column, index) => {
    if (column.fixedWidth === undefined) {
      flexible.push(column.contentWidth)
      positions.push(index)
    } else {
      fixed += column.fixedWidth
    }
  })
  const distributed = distributeColumnWidths(flexible, tableWidth - fixed)
  const widths = columns.map((column) => column.fixedWidth ?? 0)
  positions.forEach((index, position) => {
    widths[index] = distributed[position]
  })
  return widths
}
