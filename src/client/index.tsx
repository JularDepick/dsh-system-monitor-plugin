/*
 * 客户端插件:会话区域「系统监控」tab
 *
 * 经 conversation.view 槽注册浏览器端面板组件,
 * 通过 host webserver 数据端点同源轮询快照并展示。
 * 面板按两个维度各占一张卡:进程维度(dsh 进程树逐进程)与对话维度(按会话归并)。
 * 两张卡的资源占比条形状一致,为三段固定泳道:
 * 左端「其他应用」(与 dsh 无关的系统进程合计)、中段「dsh 及其子进程」(按成员相对占比分段)、
 * 右端「空闲」(整机未被占用);三段宽度固定,占用数值由各段标签给出(占整机百分比,精确到 0.01%),
 * 标签仅在所在段放得下时显示。基准字号取宿主排版 token,颜色只用宿主语义 token 与静态色 token,明暗主题自适应。
 * 作者:JularDepick
 */

import type { CSSProperties, ReactNode } from 'react'
import { Fragment, useEffect, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
// 类型面:conversation.view 槽的 SlotMap 合并(槽由 ui-conversation 声明)
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// 类型面:ctx.slots 服务的 Context 合并(slots 服务由 ui-renderer 提供)
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { Button, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, SegmentedControl, StateDot, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  CLIENT_POLL_INTERVAL,
  DEFAULT_LANE_NAMES,
  DEFAULT_PANEL_COLUMNS,
  MONITOR_DATA_PATH,
  PANEL_AUTHOR,
  PANEL_AUTHOR_URL,
  PANEL_BOTTOM_PADDING,
  PANEL_CELL_PADDING_X,
  PANEL_CHART_LABEL_WIDTH,
  PANEL_COLUMN_GUTTER,
  PANEL_HIGH_LOAD_THRESHOLD,
  PANEL_IDLE_COLOR,
  PANEL_LOCALE_NAMESPACE,
  PANEL_MAX_WIDTH,
  PANEL_OTHERS_COLOR,
  PANEL_PRIMARY_COLOR,
  PANEL_PROJECT_URL,
  PANEL_SERIES_COLORS,
  PANEL_SHARE_BAR_FALLBACK_WIDTH,
  PANEL_SHARE_BAR_BORDER_COLOR,
  PANEL_SHARE_BAR_BORDER_WIDTH,
  PANEL_SHARE_BAR_HEIGHT,
  PANEL_SHARE_BAR_HEIGHT_NAMED,
  PANEL_SHARE_DSH_RATIO,
  PANEL_SHARE_IDLE_RATIO,
  PANEL_SHARE_LABEL_CHAR_WIDTH,
  PANEL_SHARE_LABEL_PADDING,
  PANEL_SHARE_MAX_SINGLE_RATIO,
  PANEL_SHARE_MEMBER_MIN_RATIO,
  PANEL_SHARE_NAME_PADDING,
  PANEL_SHARE_NAME_MIN_CONTRAST,
  PANEL_SHARE_OTHERS_RATIO,
  PANEL_SHARE_TRACK_COLOR,
  PANEL_SETTINGS_WIDTH,
  PANEL_STACK_GAP,
  PANEL_STORAGE_KEY,
  PANEL_SWATCH_SIZE,
  PANEL_TAB_ID,
  PANEL_TAB_ORDER,
  PANEL_TABLE_CPU_WIDTH,
  PANEL_TABLE_MEMORY_PERCENT_WIDTH,
  PANEL_TABLE_MEMORY_VALUE_WIDTH,
  PANEL_TABLE_NAME_MIN_WIDTH,
  PANEL_TABLE_PARENT_WIDTH,
  PANEL_TABLE_PID_WIDTH,
  PANEL_TABLE_SESSION_COUNT_WIDTH,
  PANEL_TABLE_SESSION_WIDTH,
  PANEL_TEXT_CJK_WIDTH,
  PANEL_TOP_PADDING,
  PANEL_TYPOGRAPHY,
  PLUGIN_NAME,
} from '../constants'
import type { PanelColumns } from '../constants'
import { panelDictionaries } from './i18n'
import type { MonitorSnapshot, ResourceSample } from '../monitor/types'

/** 框架注入的面板文案翻译函数(locale 座位) */
type PanelTranslate = TranslateNS<typeof PANEL_LOCALE_NAMESPACE>

/** 面板组件 props:会话视图运行时座位 + locale 座位 */
type MonitorTabProps = PropsRuntime<'conversation.view'> & { t: PanelTranslate }

/** 分组表与占比条的一项(进程维度为单个进程,对话维度为一个会话/宿主/未归因) */
interface ShareGroup {
  /** 分组键(进程维度为 pid,对话维度为会话标识或保留键) */
  key: string
  /** 显示名 */
  label: string
  /** 附加标注(如子会话) */
  note?: string
  /** CPU 占用率(百分比,绝对量) */
  cpuPercent: number
  /** 内存占用(百分比,绝对量) */
  memoryPercent: number
  /** 内存占用(字节,绝对量) */
  memoryBytes: number
  /** 成员进程数 */
  count: number
  /** 是否为主进程/宿主分组:固定用品牌蓝,不参与系列色轮转 */
  primary?: boolean
}

/** 表格列定义:表头单元(由前一列 colSpan 覆盖时为 null)与内容自适应宽度 */
interface PanelColumn {
  head: ReactNode | null
  /** 内容自适应宽度(像素,含列宽下限):列宽先按它挤满,富余再按比例分配 */
  contentWidth: number
}

/** 占比条两端泳道所需的整机口径数值(百分比 + 内存绝对值) */
interface MachineShare {
  /** 左端:与 dsh 无关的系统进程 CPU 合计 */
  othersCpu: number
  /** 右端:整机未被占用的 CPU */
  idleCpu: number
  /** 左端:与 dsh 无关的系统进程内存合计(占整机百分比) */
  othersMemory: number
  /** 左端:与 dsh 无关的系统进程内存合计(字节) */
  othersMemoryBytes: number
  /** 右端:整机未被占用的内存(占整机百分比) */
  idleMemory: number
  /** 整机物理内存总量(字节;用于推出「空闲」的绝对值) */
  totalMemoryBytes: number
}

/**
 * 各段候选文字(从左到右依次尝试,取第一个放得下的,都不放得下则留空);
 * 缺省时只用整机百分比。悬停提示恒取第一项(信息最全)。
 */
interface ShareTexts {
  /** 中段成员候选文字 */
  member?: (group: ShareGroup) => readonly string[]
  /** 左端候选文字 */
  others?: readonly string[]
  /** 右端候选文字 */
  idle?: readonly string[]
}

/** 归入「宿主」组的保留键(宿主进程承载全部会话,不能归给某一个会话) */
const HOST_GROUP_KEY = '\0host'
/** 归入「未归因」组的保留键 */
const UNATTRIBUTED_GROUP_KEY = '\0unattributed'

/** 格式化为 yyyy-MM-dd HH:mm:ss+HH:mm */
function formatDateTime(value: number): string {
  const date = new Date(value)
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  const zone = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${zone}`
  )
}

/** 字节数按量级自适应单位(KB/MB/GB,两位小数) */
function formatBytes(bytes: number): string {
  const kilobytes = bytes / 1024
  if (kilobytes < 1024) return `${kilobytes.toFixed(2)}KB`
  const megabytes = kilobytes / 1024
  if (megabytes < 1024) return `${megabytes.toFixed(2)}MB`
  return `${(megabytes / 1024).toFixed(2)}GB`
}

/** 百分比字符串(精确到 0.01%) */
function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

/** 第 index 个分段的分段配色(超出配色表长度后循环) */
function seriesColor(index: number): string {
  return PANEL_SERIES_COLORS[index % PANEL_SERIES_COLORS.length]
}

/**
 * 各分段的最终配色:主进程/宿主泳道固定取品牌蓝(`PANEL_PRIMARY_COLOR`,继承 profile web),
 * 其余成员按出现顺序取系列色——系列色不参与主泳道,主泳道也不占用系列色名额。
 */
function groupColors(groups: readonly ShareGroup[]): string[] {
  let next = 0
  return groups.map((group) => {
    if (group.primary === true) return PANEL_PRIMARY_COLOR
    const color = seriesColor(next)
    next += 1
    return color
  })
}

/** 文本宽度估算(像素):中日韩字符按整宽计,其余按拉丁字宽计 */
function textWidthPx(text: string): number {
  let width = 0
  for (const char of text) {
    width += (char.codePointAt(0) ?? 0) > 0x2e7f ? PANEL_TEXT_CJK_WIDTH : PANEL_SHARE_LABEL_CHAR_WIDTH
  }
  return width
}

/** 表格单元格内容宽度(像素,含左右内边距) */
function cellWidth(text: string): number {
  return textWidthPx(text) + PANEL_CELL_PADDING_X * 2
}

/** 一组文本里最宽者与给定下限的较大值(用于列宽按内容自适应) */
function maxCellWidth(texts: readonly string[], minimum: number): number {
  let width = minimum
  for (const text of texts) width = Math.max(width, cellWidth(text))
  return width
}

/**
 * 表格列宽分配:先让每列按内容宽度挤满(内容宽度由调用方按最长内容算出,已含列宽下限),
 * 再把表格富余宽度按各列内容宽度比例分给所有列 —— 富余不再被单列独吞,避免出现过大的列宽;
 * 内容挤不下(或尚未测到表格宽度)时按比例压缩到可用宽度。
 */
function distributeColumnWidths(contents: readonly number[], tableWidth: number): number[] {
  const total = contents.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return contents.map(() => 0)
  const factor = tableWidth <= 0 || tableWidth <= total ? (tableWidth <= 0 ? 1 : tableWidth / total) : 0
  if (factor > 0) return contents.map((value) => value * factor)
  return contents.map((value) => value + ((tableWidth - total) * value) / total)
}

/** 占比条段标签是否放得下:按字宽估算,文字宽加留白不超过所在段/格宽度 */
function labelFits(text: string, available: number, padding: number = PANEL_SHARE_LABEL_PADDING): boolean {
  return text.length > 0 && available >= textWidthPx(text) + padding
}

/** 从候选文字里取第一个放得下的(都不放得下则留空,由悬停提示兜底) */
function fitText(candidates: readonly string[], cellWidth: number, padding: number = PANEL_SHARE_LABEL_PADDING): string {
  for (const candidate of candidates) {
    if (labelFits(candidate, cellWidth, padding)) return candidate
  }
  return ''
}

/** 进程显示名(缺失时退化为 pid) */
function displayName(sample: ResourceSample): string {
  return sample.handle.name ?? String(sample.handle.pid)
}

/**
 * 中段各成员的显示宽度权重(合计为 1)。
 * 判定与分配都按该维度全部成员进行,使 CPU 与内存两行口径一致:
 * 只有一个成员时允许它独占中段;多个成员时每个成员先取保底宽度,
 * 最大成员封顶到 `PANEL_SHARE_MAX_SINGLE_RATIO`,其余宽度按数值比例分取
 * (其余成员数值合计为 0 时等分),任何情况下中段都被铺满、零占用成员也有可见占位。
 */
function computeLaneWeights(values: readonly number[]): number[] {
  const count = values.length
  if (count === 0) return []
  // 只有一个成员:独占中段
  if (count === 1) return [1]
  const total = values.reduce((sum, value) => sum + value, 0)
  // 全部为零:等分占位(成员仍可见,数值由表格给出)
  if (total <= 0) return values.map(() => 1 / count)
  // 成员很多时保底自动收窄,保证「非最大者」的份额够分
  const floor = Math.min(PANEL_SHARE_MEMBER_MIN_RATIO, (1 - PANEL_SHARE_MAX_SINGLE_RATIO) / count)
  const largest = values.indexOf(Math.max(...values))
  if (values[largest] / total <= PANEL_SHARE_MAX_SINGLE_RATIO) {
    // 最大成员未超上限:全体按「保底 + 数值比例」铺满中段
    const pool = 1 - count * floor
    return values.map((value) => floor + pool * (value / total))
  }
  // 最大成员封顶:其余成员先取保底,剩余宽度按其数值比例分取(合计为 0 时等分)
  const restCount = count - 1
  const restTotal = total - values[largest]
  const restPool = 1 - PANEL_SHARE_MAX_SINGLE_RATIO - restCount * floor
  return values.map((value, index) => {
    if (index === largest) return PANEL_SHARE_MAX_SINGLE_RATIO
    if (restTotal > 0) return floor + restPool * (value / restTotal)
    return floor + restPool / restCount
  })
}

/** 进程维度分组:每个进程一组,保持采集顺序(进程树在前);dsh 主进程标记为主泳道 */
function groupByProcess(processes: readonly ResourceSample[], rootPid: number): ShareGroup[] {
  return processes.map((sample) => ({
    key: String(sample.handle.pid),
    label: displayName(sample),
    ...(sample.handle.pid === rootPid ? { primary: true } : {}),
    cpuPercent: sample.cpuPercent,
    memoryPercent: sample.memoryPercent,
    memoryBytes: sample.memoryBytes,
    count: 1,
  }))
}

/**
 * 对话维度分组:按会话归并成员进程;
 * 宿主进程与无归属进程各成一组并置于末尾(宿主承载全部会话,不并入任何一个会话)。
 */
function groupBySession(
  processes: readonly ResourceSample[],
  rootPid: number,
  t: PanelTranslate,
): ShareGroup[] {
  const groups = new Map<string, ShareGroup>()
  let host: ShareGroup | undefined
  let unattributed: ShareGroup | undefined
  const merge = (group: ShareGroup, sample: ResourceSample): void => {
    group.cpuPercent += sample.cpuPercent
    group.memoryPercent += sample.memoryPercent
    group.memoryBytes += sample.memoryBytes
    group.count += 1
  }
  for (const sample of processes) {
    if (sample.handle.pid === rootPid) {
      host ??= { key: HOST_GROUP_KEY, label: t('session.host'), primary: true, cpuPercent: 0, memoryPercent: 0, memoryBytes: 0, count: 0 }
      merge(host, sample)
      continue
    }
    const owner = sample.owner
    if (owner === undefined) {
      unattributed ??= { key: UNATTRIBUTED_GROUP_KEY, label: t('session.unattributed'), cpuPercent: 0, memoryPercent: 0, memoryBytes: 0, count: 0 }
      merge(unattributed, sample)
      continue
    }
    let group = groups.get(owner.sessionId)
    if (group === undefined) {
      group = {
        key: owner.sessionId,
        label: owner.label ?? owner.sessionId,
        ...(owner.subagent === true ? { note: t('session.subagent') } : {}),
        cpuPercent: 0,
        memoryPercent: 0,
        memoryBytes: 0,
        count: 0,
      }
      groups.set(owner.sessionId, group)
    }
    merge(group, sample)
  }
  /**
   * 顺序即展示顺序(中段泳道从左到右、表格自上而下):
   * 宿主组固定在最前(占中段左端),其后是各会话(向右依次排布),无归属组置于最后。
   */
  return [
    ...(host === undefined ? [] : [host]),
    ...groups.values(),
    ...(unattributed === undefined ? [] : [unattributed]),
  ]
}

/** 面板内联样式(组件私有,类名前缀 sm- 避免与宿主冲突) */
const panelCss = `
.sm-skeleton { background: linear-gradient(90deg, var(--dsw-alias-interactive-bg-hover) 25%, var(--dsw-alias-border-l1) 50%, var(--dsw-alias-interactive-bg-hover) 75%); background-size: 400% 100%; animation: sm-shimmer 1.4s ease-in-out infinite; }
@keyframes sm-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
@media (prefers-reduced-motion: reduce) { .sm-skeleton { animation: none; } }
/* 维度卡容器:可用宽度容得下两列时并排,否则纵向堆叠(纯 CSS 栅格,无需测量宽度) */
.sm-cards { display: grid; gap: ${PANEL_STACK_GAP}px; align-items: start; }
/* 维度卡头部:可点击折叠(标题即折叠开关),悬停用宿主交互底色提示可点 */
.sm-card-head { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 10px; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.sm-card-head:hover { background: var(--dsw-alias-interactive-bg-hover); }
/* 面板根是纵向 flex 滚动容器:子块一律不参与压缩。
   卡片带 overflow:hidden,其 flex 自动最小尺寸按规范为 0,不锁死会被压扁并裁掉表格内容 */
.sm-column > * { flex: none; }
`

/**
 * 内容列:宿主视图区与滚动容器均无内边距(0.2.0-rc.2 发布包核对,与 0.1.7-rc.2、0.1.5-rc.1 一致),
 * 间距与滚动兜底须由组件自带。
 * 宽度取 tab 区域可用宽度(仅超宽屏按 PANEL_MAX_WIDTH 收窄),不再对齐宿主对话列宽,
 * 否则在宽 tab 区域内会留下大片左右空白。
 * flex/minHeight/overflow 使宿主 composer-overlay 模式(视图区定高且 overflow:hidden)
 * 下面板自身成为滚动容器,长列表不会被裁掉。
 */
const columnStyle: CSSProperties = {
  width: '100%',
  maxWidth: PANEL_MAX_WIDTH,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  flex: '0 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  gap: PANEL_STACK_GAP,
  boxSizing: 'border-box',
  padding: `${PANEL_TOP_PADDING}px ${PANEL_COLUMN_GUTTER}px ${PANEL_BOTTOM_PADDING}px`,
  color: 'var(--dsw-alias-label-primary)',
  textAlign: 'left',
  ...PANEL_TYPOGRAPHY.base,
}

/** 卡片容器:与原版卡片一致(圆角、边框、内边距) */
const cardStyle: CSSProperties = {
  boxSizing: 'border-box',
  border: '1px solid var(--dsw-alias-border-l1)',
  borderRadius: 12,
  overflow: 'hidden',
}

/** 卡片头部:维度标题 + 右侧计数与合计 */
const cardHeadStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '6px 10px',
  borderBottom: '1px solid var(--dsw-alias-border-l1)',
}

/** 卡片头部右侧元信息(计数与合计) */
const cardMetaStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-caption)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  ...PANEL_TYPOGRAPHY.caption,
}

/** 表格数据单元格(守则:表格默认水平居中;显式盒模型防宿主继承) */
const cellStyle: CSSProperties = {
  boxSizing: 'border-box',
  padding: `3px ${PANEL_CELL_PADDING_X}px`,
  textAlign: 'center',
  fontFamily: 'inherit',
  ...PANEL_TYPOGRAPHY.base,
}

/** 表头单元格 */
const headCellStyle: CSSProperties = {
  ...cellStyle,
  ...PANEL_TYPOGRAPHY.baseStrong,
  color: 'var(--dsw-alias-label-tertiary)',
  borderBottom: '1px solid var(--dsw-alias-border-l2)',
}

/** 数据单元格 */
const dataCellStyle: CSSProperties = { ...cellStyle, color: 'var(--dsw-alias-label-primary)' }

/** 占比条段标签单元格(居中、等宽数字、放不下时整格留空) */
const shareLabelStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textAlign: 'center',
  color: 'var(--dsw-alias-label-tertiary)',
  fontVariantNumeric: 'tabular-nums',
  ...PANEL_TYPOGRAPHY.caption,
}

/** 泳道单元格:名称在其中居中,超出即裁切(自身不带内外边距与行高,避免影响泳道高度) */
const laneCellStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 0,
  overflow: 'hidden',
  padding: 0,
  margin: 0,
  lineHeight: 0,
}

/**
 * 泳道内名称。
 * 名称直接压在分段底色上(不加底色块),文字色由分段底色的相对亮度在黑与白之间取对比度更高者;
 * 静态色 token 在明暗主题下取同一套取值,故按回退十六进制值判定即可。
 */
const nameTextStyle: CSSProperties = {
  maxWidth: '100%',
  padding: 0,
  margin: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  ...PANEL_TYPOGRAPHY.caption,
  // 行高压到 1:文字框只占字号高度,不把宿主说明字号的 18px 行高带进泳道
  lineHeight: 1,
}

/**
 * 从颜色 token 的回退十六进制值推出可读文字色。
 * 取色策略按「优先白色、次选黑色」:白色相对分段底色的对比度不低于阈值即用白字,
 * 只有浅色底(白色读不清)才退回黑字。
 */
function contrastTextColor(token: string): string {
  const match = /#([0-9a-f]{6})/i.exec(token)
  if (match === null) return 'var(--dsw-alias-label-primary)'
  const value = Number.parseInt(match[1], 16)
  const channel = (shift: number): number => {
    const raw = ((value >> shift) & 0xff) / 255
    return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
  const whiteContrast = 1.05 / (luminance + 0.05)
  return whiteContrast >= PANEL_SHARE_NAME_MIN_CONTRAST ? '#ffffff' : '#111111'
}

/** 配置子页:设置行(标签在左、控件在右,行间以宿主分隔线分栏) */
const settingsRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  minHeight: 36,
  padding: '4px 0',
  borderBottom: '1px solid var(--dsw-alias-border-l1)',
}

/** 配置子页:设置行的标签 */
const settingsLabelStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-primary)',
  minWidth: 0,
  ...PANEL_TYPOGRAPHY.base,
}

/** 面板本地偏好(未记录项为 null,沿用插件配置) */
interface StoredPreferences {
  /** 泳道内名称开关 */
  laneNames: boolean | null
  /** 面板视图列数 */
  columns: PanelColumns | null
}

/** 读取浏览器端记住的偏好(不可用或未记录时各项为 null) */
function readStoredPreferences(): StoredPreferences {
  const empty: StoredPreferences = { laneNames: null, columns: null }
  try {
    if (typeof localStorage === 'undefined') return empty
    const raw = localStorage.getItem(PANEL_STORAGE_KEY)
    if (raw === null) return empty
    const parsed = JSON.parse(raw) as { laneNames?: unknown; columns?: unknown }
    return {
      laneNames: typeof parsed.laneNames === 'boolean' ? parsed.laneNames : null,
      columns: parsed.columns === 1 || parsed.columns === 2 ? parsed.columns : null,
    }
  } catch {
    return empty
  }
}

/** 记录浏览器端偏好(不可用时静默:配置仍在本页生效) */
function writeStoredPreferences(patch: Partial<StoredPreferences>): void {
  try {
    if (typeof localStorage === 'undefined') return
    const raw = localStorage.getItem(PANEL_STORAGE_KEY)
    const current = raw === null ? {} : (JSON.parse(raw) as Record<string, unknown>)
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ ...current, ...patch }))
  } catch {
    // 无存储权限时忽略
  }
}

/** 名称前配色标识块(与占比条分段同色,充当图例) */
function Swatch(props: { color: string }): ReactNode {
  return (
    <span
      style={{
        width: PANEL_SWATCH_SIZE,
        height: PANEL_SWATCH_SIZE,
        flex: 'none',
        borderRadius: 3,
        background: props.color,
      }}
    />
  )
}

/** 状态徽章:官方状态点 + 语义色文本 */
function StatusBadge(props: { tone: 'ok' | 'warn' | 'error'; label: string }): ReactNode {
  const state = props.tone === 'ok' ? 'done' : props.tone === 'warn' ? 'warning' : 'error'
  const color = props.tone === 'ok'
    ? 'var(--dsw-alias-state-success-primary)'
    : props.tone === 'warn'
      ? 'var(--dsw-alias-state-warn-label)'
      : 'var(--dsw-alias-state-error-primary)'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        ...PANEL_TYPOGRAPHY.caption,
      }}
    >
      <StateDot state={state} size={8} />
      {props.label}
    </span>
  )
}

/**
 * 资源占比条(单行):三段固定宽度泳道。
 * 左端「其他应用」为与 dsh 无关的系统进程合计,中段为 dsh 及其子进程(按成员相对占比分段),
 * 右端「空闲」为整机未被占用部分;三段宽度都不随真实占用变化,占用数值由段标签给出。
 * 开启「泳道内名称」时,各段内部居中显示对应名称(进程名/对话名;两端显示泳道名),
 * 放不下则留空并只保留悬停提示。
 */
function ShareTrack(props: {
  groups: readonly ShareGroup[]
  pick: (group: ShareGroup) => number
  /** 段文字候选(缺省用整机百分比;内存泳道给「具体数值 · 百分比」等逐级退化的候选) */
  texts?: ShareTexts
  others: number
  idle: number
  width: number
  label: string
  names: boolean
  t: PanelTranslate
}): ReactNode {
  const values = props.groups.map((group) => props.pick(group))
  const weights = computeLaneWeights(values)
  const colors = groupColors(props.groups)
  const dshTotal = values.reduce((sum, value) => sum + value, 0)
  const othersText = formatPercent(props.others)
  const idleText = formatPercent(props.idle)
  const othersCandidates = props.texts?.others ?? [othersText]
  const idleCandidates = props.texts?.idle ?? [idleText]
  const othersName = props.t('chart.others')
  const idleName = props.t('chart.idle')
  const laneWidth = (ratio: number): number => props.width * ratio
  const othersFlex = `0 0 ${PANEL_SHARE_OTHERS_RATIO * 100}%`
  const dshFlex = `0 0 ${PANEL_SHARE_DSH_RATIO * 100}%`
  const idleFlex = `0 0 ${PANEL_SHARE_IDLE_RATIO * 100}%`
  const named = (text: string, cellWidth: number, color: string): ReactNode =>
    props.names && labelFits(text, cellWidth, PANEL_SHARE_NAME_PADDING)
      ? <span style={{ ...nameTextStyle, color }}>{text}</span>
      : null
  /** 段文字候选:内存泳道给「具体数值 · 百分比」并逐级退化,其余给整机百分比 */
  const segmentCandidates = (group: ShareGroup, value: number): readonly string[] =>
    props.texts?.member?.(group) ?? [formatPercent(value)]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: 0 }}>
      <div
        role="img"
        aria-label={
          `${props.label}:${othersName} ${othersText},` +
          `${props.t('chart.dsh')} ${formatPercent(dshTotal)},${idleName} ${idleText}`
        }
        style={{
          display: 'flex',
          height: props.names ? PANEL_SHARE_BAR_HEIGHT_NAMED : PANEL_SHARE_BAR_HEIGHT,
          boxSizing: 'border-box',
          border: `${PANEL_SHARE_BAR_BORDER_WIDTH}px solid ${PANEL_SHARE_BAR_BORDER_COLOR}`,
          borderRadius: 999,
          background: PANEL_SHARE_TRACK_COLOR,
          overflow: 'hidden',
        }}
      >
        {/* 左端泳道:与 dsh 无关的系统进程合计 */}
        <div title={`${othersName} ${othersCandidates[0]}`} style={{ flex: othersFlex, background: PANEL_OTHERS_COLOR, ...laneCellStyle }}>
          {named(othersName, laneWidth(PANEL_SHARE_OTHERS_RATIO), contrastTextColor(PANEL_OTHERS_COLOR))}
        </div>
        {/* 中段泳道:dsh 及其子进程,按成员显示权重分段(最大者封顶 1/3,零占用成员保底占位) */}
        <div style={{ display: 'flex', flex: dshFlex, minWidth: 0 }}>
          {props.groups.map((group, index) => {
            if (weights[index] <= 0) return null
            return (
              <div
                key={group.key}
                title={`${group.label} ${segmentCandidates(group, values[index])[0]}`}
                style={{ flexGrow: weights[index], flexBasis: 0, background: colors[index], ...laneCellStyle }}
              >
                {named(group.label, laneWidth(PANEL_SHARE_DSH_RATIO) * weights[index], contrastTextColor(colors[index]))}
              </div>
            )
          })}
        </div>
        {/* 右端泳道:整机未被占用的资源(淡灰底色,不用纯白) */}
        <div title={`${idleName} ${idleCandidates[0]}`} style={{ flex: idleFlex, background: PANEL_IDLE_COLOR, ...laneCellStyle }}>
          {named(idleName, laneWidth(PANEL_SHARE_IDLE_RATIO), 'var(--dsw-alias-label-tertiary)')}
        </div>
      </div>
      {/* 段标签行:与三段同构,取第一个放得下的候选文字(内存行会给「数值 · 百分比」) */}
      <div style={{ display: 'flex', width: '100%', height: 18 }}>
        <div style={{ flex: othersFlex, ...shareLabelStyle }}>
          {fitText(othersCandidates, laneWidth(PANEL_SHARE_OTHERS_RATIO))}
        </div>
        <div style={{ display: 'flex', flex: dshFlex, minWidth: 0 }}>
          {props.groups.map((group, index) => {
            const value = values[index]
            // 零占用成员不静默隐藏:CPU 为整机口径,1 秒窗口内常为 0.00%,按零值隐藏会让整行空白;
            // 是否显示只由「放得下」决定(放不下靠悬停提示)
            const candidates = segmentCandidates(group, value)
            const segmentWidth = laneWidth(PANEL_SHARE_DSH_RATIO) * weights[index]
            return (
              <div key={group.key} style={{ flexGrow: weights[index], flexBasis: 0, ...shareLabelStyle }}>
                {fitText(candidates, segmentWidth)}
              </div>
            )
          })}
        </div>
        <div style={{ flex: idleFlex, ...shareLabelStyle }}>
          {fitText(idleCandidates, laneWidth(PANEL_SHARE_IDLE_RATIO))}
        </div>
      </div>
    </div>
  )
}

/** 一行资源占比:指标名 + 三段占比条 */
function ShareRow(props: {
  label: string
  groups: readonly ShareGroup[]
  pick: (group: ShareGroup) => number
  texts?: ShareTexts
  others: number
  idle: number
  width: number
  names: boolean
  t: PanelTranslate
}): ReactNode {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
      <span style={{ width: PANEL_CHART_LABEL_WIDTH, flex: 'none', color: 'var(--dsw-alias-label-secondary)', ...PANEL_TYPOGRAPHY.caption }}>
        {props.label}
      </span>
      <ShareTrack
        groups={props.groups}
        pick={props.pick}
        {...(props.texts === undefined ? {} : { texts: props.texts })}
        others={props.others}
        idle={props.idle}
        width={props.width}
        label={props.label}
        names={props.names}
        t={props.t}
      />
    </div>
  )
}

/** 占比条图例:三段泳道的含义(中段用系列色渐变表示按成员分段) */
function ShareLegend(props: { t: PanelTranslate }): ReactNode {
  const items: { key: string; color: string; label: string }[] = [
    { key: 'others', color: PANEL_OTHERS_COLOR, label: props.t('chart.others') },
    {
      key: 'dsh',
      color: `linear-gradient(90deg, ${PANEL_PRIMARY_COLOR} 0 34%, ${seriesColor(0)} 34% 67%, ${seriesColor(1)} 67% 100%)`,
      label: props.t('chart.dsh'),
    },
    { key: 'idle', color: PANEL_IDLE_COLOR, label: props.t('chart.idle') },
  ]
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '2px 12px',
        color: 'var(--dsw-alias-label-tertiary)',
        ...PANEL_TYPOGRAPHY.caption,
      }}
    >
      {items.map((item) => (
        <span key={item.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: PANEL_SWATCH_SIZE,
              height: PANEL_SWATCH_SIZE,
              flex: 'none',
              borderRadius: 3,
              background: item.color,
            }}
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}

/**
 * 维度卡片:标题 + 计数与合计 + 图例 + CPU/内存两条三段占比条 + 该维度的明细表。
 * 条宽按卡片实测宽度推导(指标名列与间隙之外的剩余宽度)。
 */
function DimensionCard(props: {
  title: string
  countText: string
  groups: readonly ShareGroup[]
  machine: MachineShare
  names: boolean
  t: PanelTranslate
  columns: readonly PanelColumn[]
  row: (group: ShareGroup, index: number) => ReactNode
  emptyText: string
  ariaLabel: string
}): ReactNode {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const tableRef = useRef<HTMLTableElement | null>(null)
  const [width, setWidth] = useState(PANEL_SHARE_BAR_FALLBACK_WIDTH)
  const [tableWidth, setTableWidth] = useState(0)
  /** 卡片内容(泳道图 + 明细表)是否展开:点击头部整行切换,默认展开 */
  const [tableOpen, setTableOpen] = useState(true)

  useEffect(() => {
    const element = bodyRef.current
    if (element === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      // 行内两段:指标名列 + 占比条,一处 gap 10px
      const next = element.clientWidth - PANEL_CHART_LABEL_WIDTH - 10
      if (next > 0) setWidth(next)
      const table = tableRef.current
      if (table !== null) setTableWidth(table.clientWidth)
    })
    observer.observe(element)
    const table = tableRef.current
    if (table !== null) observer.observe(table)
    return () => observer.disconnect()
    // 展开时才测量:折叠期间泳道与表格不在 DOM 中,重新展开需重新挂观察器
  }, [tableOpen])

  const cpuTotal = props.groups.reduce((sum, group) => sum + group.cpuPercent, 0)
  const memoryTotal = props.groups.reduce((sum, group) => sum + group.memoryPercent, 0)
  /**
   * 空闲内存绝对值:整机总量减去其他应用与已监控成员,下限截零;
   * 与采集器的「空闲 = 100 − 其他 − dsh」口径同源,故百分比与绝对值一致。
   */
  const idleMemoryBytes = Math.max(
    0,
    props.machine.totalMemoryBytes
      - props.machine.othersMemoryBytes
      - props.groups.reduce((sum, group) => sum + group.memoryBytes, 0),
  )
  /** 列宽:先按内容挤满,再把富余按各列内容比例分配 */
  const columnWidths = distributeColumnWidths(props.columns.map((column) => column.contentWidth), tableWidth)
  /** 折叠开关的提示文案(展开时提示可收起,收起时提示可展开) */
  const toggleLabel = tableOpen ? props.t('table.collapse') : props.t('table.expand')

  return (
    <div style={cardStyle}>
      {/* 头部整行是折叠开关:标题即入口,左侧用宿主 chevron 图标指示展开状态 */}
      <button type="button" className="sm-card-head" aria-expanded={tableOpen} title={toggleLabel} onClick={() => setTableOpen((open) => !open)}>
        <span style={{ display: 'inline-flex', alignItems: 'center', flex: 'none', color: 'var(--dsw-alias-label-tertiary)' }}>
          {tableOpen ? <IconChevronDownOutlineRegular /> : <IconChevronRightOutlineRegular />}
        </span>
        <span style={{ color: 'var(--dsw-alias-label-secondary)', flex: 'none', ...PANEL_TYPOGRAPHY.baseStrong }}>{props.title}</span>
        <span style={cardMetaStyle}>
          {props.countText}
          {' · '}
          {props.t('chart.headerTotal', { metric: props.t('table.column.cpu'), value: formatPercent(cpuTotal) })}
          {' · '}
          {props.t('chart.headerTotal', { metric: props.t('table.column.memory'), value: formatPercent(memoryTotal) })}
        </span>
      </button>
      {!tableOpen ? null : (
        <>
          <div ref={bodyRef} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px' }}>
            <ShareLegend t={props.t} />
        <ShareRow
          label={props.t('table.column.cpu')}
          groups={props.groups}
          pick={(group) => group.cpuPercent}
          others={props.machine.othersCpu}
          idle={props.machine.idleCpu}
          width={width}
          names={props.names}
          t={props.t}
        />
        <ShareRow
          label={props.t('table.column.memory')}
          groups={props.groups}
          pick={(group) => group.memoryPercent}
          texts={{
            // 依次尝试:数值 · 百分比 → 仅数值 → 仅百分比(放不下就退化,悬停恒给最全的一条)
            member: (group) => [
              `${formatBytes(group.memoryBytes)} · ${formatPercent(group.memoryPercent)}`,
              formatBytes(group.memoryBytes),
              formatPercent(group.memoryPercent),
            ],
            others: [
              `${formatBytes(props.machine.othersMemoryBytes)} · ${formatPercent(props.machine.othersMemory)}`,
              formatBytes(props.machine.othersMemoryBytes),
              formatPercent(props.machine.othersMemory),
            ],
            idle: [
              `${formatBytes(idleMemoryBytes)} · ${formatPercent(props.machine.idleMemory)}`,
              formatBytes(idleMemoryBytes),
              formatPercent(props.machine.idleMemory),
            ],
          }}
          others={props.machine.othersMemory}
          idle={props.machine.idleMemory}
          width={width}
          names={props.names}
          t={props.t}
        />
          </div>
          {props.groups.length === 0 ? (
        <div style={{ color: 'var(--dsw-alias-label-tertiary)', textAlign: 'center', padding: '0 0 10px', ...PANEL_TYPOGRAPHY.base }}>
          {props.emptyText}
        </div>
      ) : (
        <table
          ref={tableRef}
          style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', borderSpacing: 0 }}
          aria-label={props.ariaLabel}
        >
          <colgroup>
            {columnWidths.map((columnWidth, index) => (
              <col key={index} style={columnWidth > 0 ? { width: columnWidth } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {props.columns.map((column, index) => (
                <Fragment key={index}>{column.head}</Fragment>
              ))}
            </tr>
          </thead>
          <tbody>{props.groups.map((group, index) => props.row(group, index))}</tbody>
        </table>
          )}
        </>
      )}
    </div>
  )
}

/** 面板主组件 */
const MonitorTab = (props: MonitorTabProps): ReactNode => {
  const { t } = props
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  /** 配置子页是否展开 */
  const [configOpen, setConfigOpen] = useState(false)
  /** 面板本地偏好(泳道内名称、布局;null 表示本地未改过,沿用插件配置) */
  const [preferences, setPreferences] = useState<StoredPreferences>(readStoredPreferences)

  /** 配置入口按钮(面板右上角;用宿主官方按钮,配色继承 profile web) */
  const settingsButton = (
    <Button variant="ghost" size="sm" onClick={() => setConfigOpen((open) => !open)}>
      {t('config.open')}
    </Button>
  )

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    /**
     * 单次轮询:只有「计算完成」的快照才更新界面。
     * 占位响应(采集器尚未产出首份快照)与轮询失败一律不覆盖既有内容,
     * 已渲染的面板因此不会因为一次空响应而被清空。
     */
    const tick = async (): Promise<void> => {
      try {
        const response = await fetch(MONITOR_DATA_PATH, { cache: 'no-store' })
        if (!response.ok) throw new Error(String(response.status))
        const data = (await response.json()) as MonitorSnapshot
        if (!alive) return
        if (data.sampledAt > 0) {
          setSnapshot(data)
          setUnavailable(false)
        } else if (typeof data.error === 'string' && data.error.length > 0) {
          // 采集失败:有旧快照时保留旧快照并标记不可用,无旧快照时显示不可用提示
          setUnavailable(true)
        }
        // 无错但无采样的占位响应:仅表示首轮采集尚未完成,保持当前界面等待下一轮
      } catch {
        if (!alive) return
        setUnavailable(true)
      } finally {
        // 串行轮询:等本轮请求结束再排下一轮,避免请求堆叠
        if (alive) timer = setTimeout(() => void tick(), CLIENT_POLL_INTERVAL)
      }
    }
    void tick()
    return () => {
      alive = false
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [])

  // 配置子页:展开期间按 ESC 关闭
  useEffect(() => {
    if (!configOpen || typeof window === 'undefined') return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setConfigOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [configOpen])

  /** 是否在泳道内显示名称:本地偏好优先,其次插件配置,最后默认值 */
  const laneNames = preferences.laneNames ?? snapshot?.panelOptions?.laneNames ?? DEFAULT_LANE_NAMES
  /** 面板视图列数:本地偏好优先,其次插件配置,最后默认值 */
  const columns: PanelColumns = preferences.columns ?? snapshot?.panelOptions?.columns ?? DEFAULT_PANEL_COLUMNS
  /** 更新一项面板偏好(同时写入浏览器端存储) */
  const setPreference = <K extends keyof StoredPreferences>(key: K, value: StoredPreferences[K]): void => {
    setPreferences((current) => ({ ...current, [key]: value }))
    writeStoredPreferences({ [key]: value } as Partial<StoredPreferences>)
  }

  /**
   * 配置子页:面板内展开的配置视图,由右上角按钮呼起、ESC 或「关闭」收起。
   * 控件一律用宿主官方组件(开关、分段控件、按钮),配色与外观继承 profile web;
   * 设置行收在 PANEL_SETTINGS_WIDTH 内,避免宽卡片下标签与控件相距过远。
   */
  const configCard = (
    <div style={cardStyle}>
      <div style={cardHeadStyle}>
        <span style={{ color: 'var(--dsw-alias-label-secondary)', ...PANEL_TYPOGRAPHY.baseStrong }}>{t('config.title')}</span>
        <Button variant="ghost" size="sm" onClick={() => setConfigOpen(false)}>
          {t('config.close')}
        </Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '2px 12px 10px', maxWidth: PANEL_SETTINGS_WIDTH }}>
        <div style={settingsRowStyle}>
          <span style={settingsLabelStyle}>{t('config.laneNames')}</span>
          <Switch checked={laneNames} onChange={(next) => setPreference('laneNames', next)} label={t('config.laneNames')} />
        </div>
        <div style={settingsRowStyle}>
          <span style={settingsLabelStyle}>{t('config.columns')}</span>
          <SegmentedControl
            id="sm-columns"
            value={String(columns)}
            options={[
              { value: '1', label: t('config.columnsOne') },
              { value: '2', label: t('config.columnsTwo') },
            ]}
            onChange={(next) => setPreference('columns', next === '2' ? 2 : 1)}
            label={t('config.columns')}
          />
        </div>
        <span style={{ color: 'var(--dsw-alias-label-tertiary)', paddingTop: 8, ...PANEL_TYPOGRAPHY.caption }}>{t('config.hint')}</span>
      </div>
    </div>
  )

  /**
   * 状态只保存「计算完成」的快照(采样时刻大于 0),故 snapshot 非空即可展示。
   * 占位响应不会写入状态:数据端点在首轮采集期间先等待计算完成,等待超时才返回占位快照,
   * 此时界面要么保持加载态、要么继续显示既有内容,不会出现 1970 年采样时间与全 0 指标。
   */
  const sampled = snapshot !== null

  // 加载中:骨架屏占位
  if (snapshot === null && !unavailable) {
    return (
      <div className="sm-column" style={columnStyle}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{settingsButton}</div>
        {[0, 1].map((index) => (
          <div key={index} className="sm-skeleton" style={{ height: 56, borderRadius: 12 }} />
        ))}
        <style>{panelCss}</style>
      </div>
    )
  }

  // 数据源不可用(无采样或轮询失败且无旧快照):警告条(自动轮询重试)
  if (!sampled) {
    return (
      <div className="sm-column" style={columnStyle}>
        <div style={{ ...cardStyle, background: 'var(--dsw-alias-state-warn-tertiary)', padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--dsw-alias-state-warn-label)', ...PANEL_TYPOGRAPHY.base }}>
            <StateDot state="warning" size={8} />
            {t('error.unavailable')}
          </span>
          {settingsButton}
        </div>
        {configOpen ? configCard : null}
        <style>{panelCss}</style>
      </div>
    )
  }

  const processes = snapshot.processes
  const processGroups = groupByProcess(processes, snapshot.rootPid)
  const sessionGroups = groupBySession(processes, snapshot.rootPid, t)
  /**
   * 本会话维度:只取归属为当前会话(所在 tab 的会话标识)的进程,按进程维度分组。
   * 会话标识由会话座位标准 props 注入(merged by 宿主的 ui-session,本地未安装其类型包),
   * 故按最小类型面取值:运行时为 branded 字符串,缺失时退化为空串(卡片显示空态)。
   */
  const injectedSessionId = (props as { sessionId?: unknown }).sessionId
  const currentSessionId = typeof injectedSessionId === 'string' ? injectedSessionId : ''
  const currentSessionProcesses =
    currentSessionId.length === 0
      ? []
      : processes.filter((sample) => sample.owner !== undefined && sample.owner.sessionId === currentSessionId)
  const currentSessionGroups = groupByProcess(currentSessionProcesses, snapshot.rootPid)
  const currentSessionColors = groupColors(currentSessionGroups)
  /** 两张卡各自的成员配色(主进程/宿主固定品牌蓝,其余按系列色) */
  const processColors = groupColors(processGroups)
  const sessionColors = groupColors(sessionGroups)
  /** 进程分组键 → 样本(进程维度分组与样本一一对应,按键取用避免下标耦合) */
  const sampleByPid = new Map(processes.map((sample) => [String(sample.handle.pid), sample]))
  /** 占比条两端泳道的整机口径数值(两张卡一致,只有中段分组不同) */
  const machine: MachineShare = {
    othersCpu: snapshot.totals.othersCpuPercent,
    idleCpu: snapshot.totals.idleCpuPercent,
    othersMemory: snapshot.totals.othersMemoryPercent,
    othersMemoryBytes: snapshot.totals.othersMemoryBytes,
    idleMemory: snapshot.totals.idleMemoryPercent,
    totalMemoryBytes: snapshot.totalMemoryBytes,
  }
  const summary: { key: 'summary.sampledAt' | 'summary.platform' | 'summary.pollInterval' | 'summary.cpuCount' | 'summary.totalMemory' | 'summary.rootPid' | 'summary.others'; value: string }[] = [
    { key: 'summary.sampledAt', value: formatDateTime(snapshot.sampledAt) },
    { key: 'summary.platform', value: snapshot.platform || t('summary.platformUnknown') },
    { key: 'summary.pollInterval', value: `${snapshot.pollInterval}ms` },
    { key: 'summary.cpuCount', value: String(snapshot.cpuCount) },
    { key: 'summary.totalMemory', value: formatBytes(snapshot.totalMemoryBytes) },
    { key: 'summary.rootPid', value: String(snapshot.rootPid) },
    { key: 'summary.others', value: String(snapshot.totals.othersCount) },
  ]

  /** 单元格中的数值(高占用时按语义色高亮) */
  const valueCell = (text: string, high: boolean, key?: string): ReactNode => (
    <td key={key} style={{ ...dataCellStyle, fontVariantNumeric: 'tabular-nums', color: high ? 'var(--dsw-alias-state-error-primary)' : undefined }}>
      {text}
    </td>
  )

  /** 进程样本的会话名称(无归属显示占位符) */
  const sessionLabelOf = (sample: ResourceSample): string =>
    sample.owner === undefined ? '--' : sample.owner.label ?? sample.owner.sessionId
  /** 表头单元(统一样式;span 用于「内存」这类跨两列的共用表头) */
  const head = (text: string, span?: number): ReactNode => (
    <th scope="col" {...(span === undefined ? {} : { colSpan: span })} style={headCellStyle}>{text}</th>
  )
  /** 名称列内容宽度(名称前还有色块与间距) */
  const nameColumnWidth = (labels: readonly string[]): number =>
    maxCellWidth(labels, PANEL_TABLE_NAME_MIN_WIDTH) + PANEL_SWATCH_SIZE + 6
  /** 进程维度表的列定义(内容宽度取表头文案与最长内容的较大者,并不低于列宽下限) */
  const processColumns: PanelColumn[] = [
    { head: head(t('table.column.process')), contentWidth: nameColumnWidth(processGroups.map((group) => group.label)) },
    {
      head: head(t('table.column.pid')),
      contentWidth: maxCellWidth([t('table.column.pid'), ...processes.map((sample) => String(sample.handle.pid))], PANEL_TABLE_PID_WIDTH),
    },
    {
      head: head(t('table.column.parent')),
      contentWidth: maxCellWidth(
        [t('table.column.parent'), ...processes.map((sample) => String(sample.handle.parentPid ?? ''))],
        PANEL_TABLE_PARENT_WIDTH,
      ),
    },
    {
      head: head(t('table.column.session')),
      contentWidth: maxCellWidth([t('table.column.session'), ...processes.map(sessionLabelOf)], PANEL_TABLE_SESSION_WIDTH),
    },
    {
      head: head(t('table.column.cpu')),
      contentWidth: maxCellWidth([t('table.column.cpu'), ...processGroups.map((group) => formatPercent(group.cpuPercent))], PANEL_TABLE_CPU_WIDTH),
    },
    {
      head: head(t('table.column.memory'), 2),
      contentWidth: maxCellWidth(
        [t('table.column.memory'), ...processGroups.map((group) => formatBytes(group.memoryBytes))],
        PANEL_TABLE_MEMORY_VALUE_WIDTH,
      ),
    },
    {
      head: null,
      contentWidth: maxCellWidth(processGroups.map((group) => formatPercent(group.memoryPercent)), PANEL_TABLE_MEMORY_PERCENT_WIDTH),
    },
  ]
  /** 对话维度表的列定义(首列显示会话名,子会话带标注) */
  const sessionLabels = sessionGroups.map((group) => (group.note === undefined ? group.label : `${group.label} · ${group.note}`))
  const sessionColumns: PanelColumn[] = [
    { head: head(t('session.column.session')), contentWidth: nameColumnWidth(sessionLabels) },
    {
      head: head(t('session.column.processes')),
      contentWidth: maxCellWidth(
        [t('session.column.processes'), ...sessionGroups.map((group) => String(group.count))],
        PANEL_TABLE_SESSION_COUNT_WIDTH,
      ),
    },
    {
      head: head(t('table.column.cpu')),
      contentWidth: maxCellWidth([t('table.column.cpu'), ...sessionGroups.map((group) => formatPercent(group.cpuPercent))], PANEL_TABLE_CPU_WIDTH),
    },
    {
      head: head(t('table.column.memory'), 2),
      contentWidth: maxCellWidth(
        [t('table.column.memory'), ...sessionGroups.map((group) => formatBytes(group.memoryBytes))],
        PANEL_TABLE_MEMORY_VALUE_WIDTH,
      ),
    },
    {
      head: null,
      contentWidth: maxCellWidth(sessionGroups.map((group) => formatPercent(group.memoryPercent)), PANEL_TABLE_MEMORY_PERCENT_WIDTH),
    },
  ]
  /** 本会话维度表的列定义(全部行同属当前会话,故不设会话列) */
  const currentSessionColumns: PanelColumn[] = [
    {
      head: head(t('table.column.process')),
      contentWidth: nameColumnWidth(currentSessionGroups.map((group) => group.label)),
    },
    {
      head: head(t('table.column.pid')),
      contentWidth: maxCellWidth(
        [t('table.column.pid'), ...currentSessionProcesses.map((sample) => String(sample.handle.pid))],
        PANEL_TABLE_PID_WIDTH,
      ),
    },
    {
      head: head(t('table.column.parent')),
      contentWidth: maxCellWidth(
        [t('table.column.parent'), ...currentSessionProcesses.map((sample) => String(sample.handle.parentPid ?? ''))],
        PANEL_TABLE_PARENT_WIDTH,
      ),
    },
    {
      head: head(t('table.column.cpu')),
      contentWidth: maxCellWidth(
        [t('table.column.cpu'), ...currentSessionGroups.map((group) => formatPercent(group.cpuPercent))],
        PANEL_TABLE_CPU_WIDTH,
      ),
    },
    {
      head: head(t('table.column.memory'), 2),
      contentWidth: maxCellWidth(
        [t('table.column.memory'), ...currentSessionGroups.map((group) => formatBytes(group.memoryBytes))],
        PANEL_TABLE_MEMORY_VALUE_WIDTH,
      ),
    },
    {
      head: null,
      contentWidth: maxCellWidth(
        currentSessionGroups.map((group) => formatPercent(group.memoryPercent)),
        PANEL_TABLE_MEMORY_PERCENT_WIDTH,
      ),
    },
  ]

  return (
    <div className="sm-column" style={columnStyle}>
      <style>{panelCss}</style>
      {/* 统计卡:KPI 与状态(静态面色用层级 token,不用交互态 hover token) */}
      <div style={{ ...cardStyle, background: 'var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2, var(--dsw-alias-interactive-bg-hover)))', padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{ color: 'var(--dsw-alias-label-primary)', fontVariantNumeric: 'tabular-nums', ...PANEL_TYPOGRAPHY.kpi }}>
            {processes.length}
          </span>
          <span style={{ color: 'var(--dsw-alias-label-tertiary)', ...PANEL_TYPOGRAPHY.base }}>{t('stat.processes')}</span>
        </div>
        {/* 右侧成组:状态徽章与配置入口相邻,避免宽卡片下空间被均摊 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          {/* 旧快照仍在展示时,轮询失败以警示徽章标明数据已非最新 */}
          {unavailable ? (
            <StatusBadge tone="warn" label={t('stat.unavailable')} />
          ) : snapshot.degraded ? (
            <StatusBadge tone="warn" label={t('stat.degraded')} />
          ) : (
            <StatusBadge tone="ok" label={t('stat.normal')} />
          )}
          {settingsButton}
        </div>
      </div>
      {/* 系统信息行 */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0 12px',
          color: 'var(--dsw-alias-label-tertiary)',
          ...PANEL_TYPOGRAPHY.caption,
        }}
      >
        {summary.map((item) => (
          <span key={item.key}>
            {t(item.key)}:
            <span style={{ color: 'var(--dsw-alias-label-secondary)', fontVariantNumeric: 'tabular-nums' }}> {item.value}</span>
          </span>
        ))}
      </div>
      {/* 配置子页展开时替换维度卡;关闭时还原为响应式栅格 */}
      {configOpen ? configCard : null}
      <div
        className="sm-cards"
        style={{
          display: configOpen ? 'none' : undefined,
          // 视图列数由用户选择:单列纵向排布,双列强制两列等高起点对齐
          gridTemplateColumns: columns === 2 ? 'repeat(2, minmax(0, 1fr))' : '1fr',
        }}
      >
      {/* 本会话维度卡(最前):只统计当前会话的进程资源 */}
      <DimensionCard
        title={t('currentProcess.title')}
        countText={t('currentProcess.count', { count: currentSessionGroups.length })}
        groups={currentSessionGroups}
        machine={machine}
        names={laneNames}
        t={t}
        columns={currentSessionColumns}
        row={(group, index) => {
          const sample = sampleByPid.get(group.key)
          const last = index === currentSessionGroups.length - 1
          const high = group.memoryPercent > PANEL_HIGH_LOAD_THRESHOLD
          return (
            <tr key={group.key} style={{ borderBottom: last ? 'none' : '1px solid var(--dsw-alias-border-l1)' }}>
              <td style={dataCellStyle} title={group.label}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 0 }}>
                  <Swatch color={currentSessionColors[index]} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.label}</span>
                </span>
              </td>
              <td style={{ ...dataCellStyle, fontVariantNumeric: 'tabular-nums' }}>{sample?.handle.pid ?? ''}</td>
              <td style={{ ...dataCellStyle, fontVariantNumeric: 'tabular-nums' }}>{sample?.handle.parentPid ?? ''}</td>
              {valueCell(formatPercent(group.cpuPercent), group.cpuPercent > PANEL_HIGH_LOAD_THRESHOLD)}
              {valueCell(formatBytes(group.memoryBytes), high)}
              {valueCell(formatPercent(group.memoryPercent), high)}
            </tr>
          )
        }}
        emptyText={t('empty.noCurrentProcesses')}
        ariaLabel={t('currentProcess.title')}
      />
      {/* 进程维度卡 */}
      <DimensionCard
        title={t('table.title')}
        countText={t('table.count', { count: processGroups.length })}
        groups={processGroups}
        machine={machine}
        names={laneNames}
        t={t}
        emptyText={t('empty.noProcesses')}
        ariaLabel={t('table.ariaLabel')}
        columns={processColumns}
        row={(group, index) => {
          const sample = sampleByPid.get(group.key)
          const last = index === processGroups.length - 1
          const owner = sample?.owner
          const sessionLabel = sample === undefined ? '--' : sessionLabelOf(sample)
          const high = group.memoryPercent > PANEL_HIGH_LOAD_THRESHOLD
          return (
            <tr key={group.key} style={{ borderBottom: last ? 'none' : '1px solid var(--dsw-alias-border-l1)' }}>
              <td style={dataCellStyle} title={group.label}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 0 }}>
                  <Swatch color={processColors[index]} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.label}</span>
                </span>
              </td>
              <td style={{ ...dataCellStyle, fontVariantNumeric: 'tabular-nums' }}>{sample?.handle.pid ?? ''}</td>
              <td style={{ ...dataCellStyle, fontVariantNumeric: 'tabular-nums' }}>{sample?.handle.parentPid ?? ''}</td>
              <td style={{ ...dataCellStyle, color: owner === undefined ? 'var(--dsw-alias-label-tertiary)' : undefined }} title={sessionLabel}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sessionLabel}</span>
              </td>
              {valueCell(formatPercent(group.cpuPercent), group.cpuPercent > PANEL_HIGH_LOAD_THRESHOLD)}
              {valueCell(formatBytes(group.memoryBytes), high)}
              {valueCell(formatPercent(group.memoryPercent), high)}
            </tr>
          )
        }}
      />
      {/* 对话维度卡 */}
      <DimensionCard
        title={t('session.title')}
        countText={t('session.count', {
          // 计数只数真实会话:宿主与未归因是补充行,不计入对话数
          count: sessionGroups.filter((group) => group.key !== HOST_GROUP_KEY && group.key !== UNATTRIBUTED_GROUP_KEY).length,
        })}
        groups={sessionGroups}
        machine={machine}
        names={laneNames}
        t={t}
        emptyText={t('empty.noProcesses')}
        ariaLabel={t('session.title')}
        columns={sessionColumns}
        row={(group, index) => {
          const last = index === sessionGroups.length - 1
          const label = group.note === undefined ? group.label : `${group.label} · ${group.note}`
          const high = group.memoryPercent > PANEL_HIGH_LOAD_THRESHOLD
          return (
            <tr key={group.key} style={{ borderBottom: last ? 'none' : '1px solid var(--dsw-alias-border-l1)' }}>
              <td style={dataCellStyle} title={label}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 0 }}>
                  <Swatch color={sessionColors[index]} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                </span>
              </td>
              <td style={{ ...dataCellStyle, fontVariantNumeric: 'tabular-nums' }}>{group.count}</td>
              {valueCell(formatPercent(group.cpuPercent), group.cpuPercent > PANEL_HIGH_LOAD_THRESHOLD)}
              {valueCell(formatBytes(group.memoryBytes), high)}
              {valueCell(formatPercent(group.memoryPercent), high)}
            </tr>
          )
        }}
      />
      </div>
      {/* 页脚:项目与作者链接 */}
      <div style={{ color: 'var(--dsw-alias-label-caption)', textAlign: 'center', ...PANEL_TYPOGRAPHY.caption }}>
        <a href={PANEL_PROJECT_URL} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
          {PLUGIN_NAME}
        </a>
        {' · '}
        <a href={PANEL_AUTHOR_URL} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
          {PANEL_AUTHOR}
        </a>
      </div>
    </div>
  )
}

/** 客户端插件名称 */
export const name = PLUGIN_NAME

/** 客户端插件依赖的服务(缺失时框架不执行 apply,故运行时无需再判空) */
export const inject = ['slots', 'locale']

/**
 * 宿主 locale 服务的最小类型面:注册字典 + 绑定命名空间。
 * 类型家为 `@deepseek-ai/dsh-client-locale`,它只承载类型用途,
 * 故不引入为 devDependency(与本插件其余 dsh 包走 type-only 引入同理)。
 */
interface LocaleRuntimeFace {
  /** 注册某命名空间全部内置语言的字典(返回注销器) */
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
  /** 绑定命名空间的翻译函数(读取时取当前语言) */
  bind(namespace: string): (key: string, params?: Record<string, unknown>) => string
}

/** 注册会话区域「系统监控」tab */
export function apply(ctx: Context): void {
  // 文案字典注册进宿主 locale 服务,标签与面板文案因此跟随 dsh 界面语言
  const locale = ctx.get('locale') as unknown as LocaleRuntimeFace
  ctx.effect(() => locale.register(PANEL_LOCALE_NAMESPACE, panelDictionaries))
  const translate = locale.bind(PANEL_LOCALE_NAMESPACE)
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: PANEL_TAB_ID,
    order: PANEL_TAB_ORDER,
    // 声明字典命名空间:框架向组件注入 t 座位,并在语言切换时重建该座位
    locale: PANEL_LOCALE_NAMESPACE,
    label: () => translate('tab.label'),
  }, MonitorTab))
}
