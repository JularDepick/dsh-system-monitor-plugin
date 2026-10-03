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
import { useEffect, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
// 类型面:conversation.view 槽的 SlotMap 合并(槽由 ui-conversation 声明)
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// 类型面:ctx.slots 服务的 Context 合并(slots 服务由 ui-renderer 提供)
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  CLIENT_POLL_INTERVAL,
  DEFAULT_LANE_NAMES,
  MONITOR_DATA_PATH,
  PANEL_AUTHOR,
  PANEL_AUTHOR_URL,
  PANEL_BOTTOM_PADDING,
  PANEL_CELL_PADDING_X,
  PANEL_CHART_LABEL_WIDTH,
  PANEL_COLUMN_GUTTER,
  PANEL_HIGH_LOAD_THRESHOLD,
  PANEL_LOCALE_NAMESPACE,
  PANEL_OTHERS_COLOR,
  PANEL_PROJECT_URL,
  PANEL_SERIES_COLORS,
  PANEL_SHARE_BAR_FALLBACK_WIDTH,
  PANEL_SHARE_BAR_HEIGHT,
  PANEL_SHARE_BAR_HEIGHT_NAMED,
  PANEL_SHARE_DSH_RATIO,
  PANEL_SHARE_IDLE_RATIO,
  PANEL_SHARE_LABEL_CHAR_WIDTH,
  PANEL_SHARE_LABEL_PADDING,
  PANEL_SHARE_MAX_SINGLE_RATIO,
  PANEL_SHARE_MEMBER_MIN_RATIO,
  PANEL_SHARE_NAME_PADDING,
  PANEL_SHARE_OTHERS_RATIO,
  PANEL_STACK_GAP,
  PANEL_SWATCH_SIZE,
  PANEL_TAB_ID,
  PANEL_TAB_ORDER,
  PANEL_TABLE_CPU_WIDTH,
  PANEL_TABLE_MEMORY_WIDTH,
  PANEL_TABLE_PARENT_WIDTH,
  PANEL_TABLE_PID_WIDTH,
  PANEL_TABLE_SESSION_COUNT_WIDTH,
  PANEL_TOP_PADDING,
  PANEL_TYPOGRAPHY,
  PLUGIN_NAME,
} from '../constants'
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
}

/** 占比条两端泳道所需的整机口径数值(均为占整机百分比) */
interface MachineShare {
  /** 左端:与 dsh 无关的系统进程 CPU 合计 */
  othersCpu: number
  /** 右端:整机未被占用的 CPU */
  idleCpu: number
  /** 左端:与 dsh 无关的系统进程内存合计 */
  othersMemory: number
  /** 右端:整机未被占用的内存 */
  idleMemory: number
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

/** 占比条段标签是否放得下:按字宽估算,文字宽加留白不超过所在段/格宽度 */
function labelFits(text: string, cellWidth: number, padding: number = PANEL_SHARE_LABEL_PADDING): boolean {
  return text.length > 0 && cellWidth >= text.length * PANEL_SHARE_LABEL_CHAR_WIDTH + padding
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

/** 进程维度分组:每个进程一组,保持采集顺序(进程树在前) */
function groupByProcess(processes: readonly ResourceSample[]): ShareGroup[] {
  return processes.map((sample) => ({
    key: String(sample.handle.pid),
    label: displayName(sample),
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
      host ??= { key: HOST_GROUP_KEY, label: t('session.host'), cpuPercent: 0, memoryPercent: 0, memoryBytes: 0, count: 0 }
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
  return [
    ...groups.values(),
    ...(host === undefined ? [] : [host]),
    ...(unattributed === undefined ? [] : [unattributed]),
  ]
}

/** 面板内联样式(组件私有,类名前缀 sm- 避免与宿主冲突) */
const panelCss = `
.sm-skeleton { background: linear-gradient(90deg, var(--dsw-alias-interactive-bg-hover) 25%, var(--dsw-alias-border-l1) 50%, var(--dsw-alias-interactive-bg-hover) 75%); background-size: 400% 100%; animation: sm-shimmer 1.4s ease-in-out infinite; }
@keyframes sm-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
@media (prefers-reduced-motion: reduce) { .sm-skeleton { animation: none; } }
/* 面板根是纵向 flex 滚动容器:子块一律不参与压缩。
   卡片带 overflow:hidden,其 flex 自动最小尺寸按规范为 0,不锁死会被压扁并裁掉表格内容 */
.sm-column > * { flex: none; }
`

/**
 * 内容列:宿主视图区与滚动容器均无内边距(0.2.0-rc.2 发布包核对,与 0.1.7-rc.2、0.1.5-rc.1 一致),
 * 间距与滚动兜底须由组件自带。
 * flex/minHeight/overflow 使宿主 composer-overlay 模式(视图区定高且 overflow:hidden)
 * 下面板自身成为滚动容器,长列表不会被裁掉。
 */
const columnStyle: CSSProperties = {
  maxWidth: `calc(var(--dsh-chat-content-width, 748px) + ${PANEL_COLUMN_GUTTER * 2}px)`,
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

/** 泳道单元格:名称在其中居中,超出即裁切 */
const laneCellStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 0,
  overflow: 'hidden',
}

/**
 * 泳道内名称条。
 * 分段底色是彩色(明暗主题下取值不同),故名称不直接压在底色上,
 * 而用宿主浮层底色 + 主要文字色的小色块承载,保证任意分段色下都可读。
 */
const nameChipStyle: CSSProperties = {
  maxWidth: '100%',
  padding: '0 4px',
  borderRadius: 3,
  background: 'var(--dsw-alias-bg-overlay)',
  color: 'var(--dsw-alias-label-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  ...PANEL_TYPOGRAPHY.caption,
}

/** 名称前配色标识块(与占比条分段同色,充当图例) */
function Swatch(props: { index: number }): ReactNode {
  return (
    <span
      style={{
        width: PANEL_SWATCH_SIZE,
        height: PANEL_SWATCH_SIZE,
        flex: 'none',
        borderRadius: 3,
        background: seriesColor(props.index),
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
  others: number
  idle: number
  width: number
  label: string
  names: boolean
  t: PanelTranslate
}): ReactNode {
  const values = props.groups.map((group) => props.pick(group))
  const weights = computeLaneWeights(values)
  const dshTotal = values.reduce((sum, value) => sum + value, 0)
  const othersText = formatPercent(props.others)
  const idleText = formatPercent(props.idle)
  const othersName = props.t('chart.others')
  const idleName = props.t('chart.idle')
  const laneWidth = (ratio: number): number => props.width * ratio
  const othersFlex = `0 0 ${PANEL_SHARE_OTHERS_RATIO * 100}%`
  const dshFlex = `0 0 ${PANEL_SHARE_DSH_RATIO * 100}%`
  const idleFlex = `0 0 ${PANEL_SHARE_IDLE_RATIO * 100}%`
  const named = (text: string, cellWidth: number): ReactNode =>
    props.names && labelFits(text, cellWidth, PANEL_SHARE_NAME_PADDING)
      ? <span style={nameChipStyle}>{text}</span>
      : null
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
          borderRadius: 999,
          background: 'var(--dsw-alias-interactive-bg-hover)',
          overflow: 'hidden',
        }}
      >
        {/* 左端泳道:与 dsh 无关的系统进程合计 */}
        <div title={`${othersName} ${othersText}`} style={{ flex: othersFlex, background: PANEL_OTHERS_COLOR, ...laneCellStyle }}>
          {named(othersName, laneWidth(PANEL_SHARE_OTHERS_RATIO))}
        </div>
        {/* 中段泳道:dsh 及其子进程,按成员显示权重分段(最大者封顶 1/3,零占用成员保底占位) */}
        <div style={{ display: 'flex', flex: dshFlex, minWidth: 0 }}>
          {props.groups.map((group, index) => {
            if (weights[index] <= 0) return null
            return (
              <div
                key={group.key}
                title={`${group.label} ${formatPercent(values[index])}`}
                style={{ flexGrow: weights[index], flexBasis: 0, background: seriesColor(index), ...laneCellStyle }}
              >
                {named(group.label, laneWidth(PANEL_SHARE_DSH_RATIO) * weights[index])}
              </div>
            )
          })}
        </div>
        {/* 右端泳道:整机未被占用的资源(保持轨道底色) */}
        <div title={`${idleName} ${idleText}`} style={{ flex: idleFlex, ...laneCellStyle }}>
          {named(idleName, laneWidth(PANEL_SHARE_IDLE_RATIO))}
        </div>
      </div>
      {/* 段标签行:与三段同构,数值为占整机百分比,放不下则留空 */}
      <div style={{ display: 'flex', width: '100%', height: 18 }}>
        <div style={{ flex: othersFlex, ...shareLabelStyle }}>
          {labelFits(othersText, laneWidth(PANEL_SHARE_OTHERS_RATIO)) ? othersText : ''}
        </div>
        <div style={{ display: 'flex', flex: dshFlex, minWidth: 0 }}>
          {props.groups.map((group, index) => {
            const value = values[index]
            // 零占用成员不显示 0.00% 标签(信息由悬停提示给出),保持标签行干净
            const text = value > 0 ? formatPercent(value) : ''
            const segmentWidth = laneWidth(PANEL_SHARE_DSH_RATIO) * weights[index]
            return (
              <div key={group.key} style={{ flexGrow: weights[index], flexBasis: 0, ...shareLabelStyle }}>
                {labelFits(text, segmentWidth) ? text : ''}
              </div>
            )
          })}
        </div>
        <div style={{ flex: idleFlex, ...shareLabelStyle }}>
          {labelFits(idleText, laneWidth(PANEL_SHARE_IDLE_RATIO)) ? idleText : ''}
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
      color: `linear-gradient(90deg, ${seriesColor(0)} 0 34%, ${seriesColor(1)} 34% 67%, ${seriesColor(2)} 67% 100%)`,
      label: props.t('chart.dsh'),
    },
    { key: 'idle', color: 'var(--dsw-alias-interactive-bg-hover)', label: props.t('chart.idle') },
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
  headCells: ReactNode
  colgroup: ReactNode
  row: (group: ShareGroup, index: number) => ReactNode
  emptyText: string
  ariaLabel: string
}): ReactNode {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(PANEL_SHARE_BAR_FALLBACK_WIDTH)

  useEffect(() => {
    const element = bodyRef.current
    if (element === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      // 行内两段:指标名列 + 占比条,一处 gap 10px
      const next = element.clientWidth - PANEL_CHART_LABEL_WIDTH - 10
      if (next > 0) setWidth(next)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const cpuTotal = props.groups.reduce((sum, group) => sum + group.cpuPercent, 0)
  const memoryTotal = props.groups.reduce((sum, group) => sum + group.memoryPercent, 0)

  return (
    <div style={cardStyle}>
      <div style={cardHeadStyle}>
        <span style={{ color: 'var(--dsw-alias-label-secondary)', flex: 'none', ...PANEL_TYPOGRAPHY.baseStrong }}>{props.title}</span>
        <span style={cardMetaStyle}>
          {props.countText}
          {' · '}
          {props.t('chart.headerTotal', { metric: props.t('table.column.cpu'), value: formatPercent(cpuTotal) })}
          {' · '}
          {props.t('chart.headerTotal', { metric: props.t('table.column.memory'), value: formatPercent(memoryTotal) })}
        </span>
      </div>
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
        <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', borderSpacing: 0 }} aria-label={props.ariaLabel}>
          {props.colgroup}
          <thead>
            <tr>{props.headCells}</tr>
          </thead>
          <tbody>{props.groups.map((group, index) => props.row(group, index))}</tbody>
        </table>
      )}
    </div>
  )
}

/** 面板主组件 */
const MonitorTab = (props: MonitorTabProps): ReactNode => {
  const { t } = props
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null)
  const [unavailable, setUnavailable] = useState(false)

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
        <div style={{ ...cardStyle, background: 'var(--dsw-alias-state-warn-tertiary)', padding: '8px 10px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--dsw-alias-state-warn-label)', ...PANEL_TYPOGRAPHY.base }}>
            <StateDot state="warning" size={8} />
            {t('error.unavailable')}
          </span>
        </div>
        <style>{panelCss}</style>
      </div>
    )
  }

  const processes = snapshot.processes
  const processGroups = groupByProcess(processes)
  const sessionGroups = groupBySession(processes, snapshot.rootPid, t)
  /** 进程分组键 → 样本(进程维度分组与样本一一对应,按键取用避免下标耦合) */
  const sampleByPid = new Map(processes.map((sample) => [String(sample.handle.pid), sample]))
  /** 占比条两端泳道的整机口径数值(两张卡一致,只有中段分组不同) */
  const machine: MachineShare = {
    othersCpu: snapshot.totals.othersCpuPercent,
    idleCpu: snapshot.totals.idleCpuPercent,
    othersMemory: snapshot.totals.othersMemoryPercent,
    idleMemory: snapshot.totals.idleMemoryPercent,
  }
  /** 是否在泳道内显示名称(来自插件配置;配置缺失时用默认值) */
  const laneNames = snapshot.panelOptions?.laneNames ?? DEFAULT_LANE_NAMES
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
        {/* 旧快照仍在展示时,轮询失败以警示徽章标明数据已非最新 */}
        {unavailable ? (
          <StatusBadge tone="warn" label={t('stat.unavailable')} />
        ) : snapshot.degraded ? (
          <StatusBadge tone="warn" label={t('stat.degraded')} />
        ) : (
          <StatusBadge tone="ok" label={t('stat.normal')} />
        )}
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
        colgroup={(
          <colgroup>
            <col />
            <col style={{ width: PANEL_TABLE_PID_WIDTH }} />
            <col style={{ width: PANEL_TABLE_PARENT_WIDTH }} />
            <col style={{ width: PANEL_TABLE_CPU_WIDTH }} />
            <col style={{ width: PANEL_TABLE_MEMORY_WIDTH }} />
          </colgroup>
        )}
        headCells={(
          <>
            <th scope="col" style={headCellStyle}>{t('table.column.process')}</th>
            <th scope="col" style={headCellStyle}>{t('table.column.pid')}</th>
            <th scope="col" style={headCellStyle}>{t('table.column.parent')}</th>
            <th scope="col" style={headCellStyle}>{t('table.column.cpu')}</th>
            <th scope="col" style={headCellStyle}>{t('table.column.memory')}</th>
          </>
        )}
        row={(group, index) => {
          const sample = sampleByPid.get(group.key)
          const last = index === processGroups.length - 1
          return (
            <tr key={group.key} style={{ borderBottom: last ? 'none' : '1px solid var(--dsw-alias-border-l1)' }}>
              <td style={dataCellStyle} title={group.label}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 0 }}>
                  <Swatch index={index} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.label}</span>
                </span>
              </td>
              <td style={{ ...dataCellStyle, fontVariantNumeric: 'tabular-nums' }}>{sample?.handle.pid ?? ''}</td>
              <td style={{ ...dataCellStyle, fontVariantNumeric: 'tabular-nums' }}>{sample?.handle.parentPid ?? ''}</td>
              {valueCell(formatPercent(group.cpuPercent), group.cpuPercent > PANEL_HIGH_LOAD_THRESHOLD)}
              {valueCell(`${formatBytes(group.memoryBytes)} · ${formatPercent(group.memoryPercent)}`, group.memoryPercent > PANEL_HIGH_LOAD_THRESHOLD)}
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
        colgroup={(
          <colgroup>
            <col />
            <col style={{ width: PANEL_TABLE_SESSION_COUNT_WIDTH }} />
            <col style={{ width: PANEL_TABLE_CPU_WIDTH }} />
            <col style={{ width: PANEL_TABLE_MEMORY_WIDTH }} />
          </colgroup>
        )}
        headCells={(
          <>
            <th scope="col" style={headCellStyle}>{t('session.column.session')}</th>
            <th scope="col" style={headCellStyle}>{t('session.column.processes')}</th>
            <th scope="col" style={headCellStyle}>{t('table.column.cpu')}</th>
            <th scope="col" style={headCellStyle}>{t('table.column.memory')}</th>
          </>
        )}
        row={(group, index) => {
          const last = index === sessionGroups.length - 1
          const label = group.note === undefined ? group.label : `${group.label} · ${group.note}`
          return (
            <tr key={group.key} style={{ borderBottom: last ? 'none' : '1px solid var(--dsw-alias-border-l1)' }}>
              <td style={dataCellStyle} title={label}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 0 }}>
                  <Swatch index={index} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                </span>
              </td>
              <td style={{ ...dataCellStyle, fontVariantNumeric: 'tabular-nums' }}>{group.count}</td>
              {valueCell(formatPercent(group.cpuPercent), group.cpuPercent > PANEL_HIGH_LOAD_THRESHOLD)}
              {valueCell(`${formatBytes(group.memoryBytes)} · ${formatPercent(group.memoryPercent)}`, group.memoryPercent > PANEL_HIGH_LOAD_THRESHOLD)}
            </tr>
          )
        }}
      />
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
