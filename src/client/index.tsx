/*
 * 客户端插件:会话区域「系统监控」tab
 *
 * 经 conversation.view 槽注册浏览器端面板组件,
 * 通过 host webserver 数据端点同源轮询快照并展示。
 * 面板按两个维度各占一张卡:进程维度(dsh 进程树逐进程)与对话维度(按会话归并);
 * 两张卡的资源占比条形状一致——右端固定 20% 为空闲段,左端 80% 由已用项按相对占比铺满,
 * 每段正下方在放得下文字且占比不小于 1% 时显示整数百分比。
 * 基准字号取宿主排版 token,颜色只用宿主语义 token 与静态色 token,明暗主题自适应。
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
  MONITOR_DATA_PATH,
  PANEL_AUTHOR,
  PANEL_AUTHOR_URL,
  PANEL_BOTTOM_PADDING,
  PANEL_CELL_PADDING_X,
  PANEL_CHART_LABEL_WIDTH,
  PANEL_COLUMN_GUTTER,
  PANEL_HIGH_LOAD_THRESHOLD,
  PANEL_LOCALE_NAMESPACE,
  PANEL_PROJECT_URL,
  PANEL_SERIES_COLORS,
  PANEL_SHARE_BAR_FALLBACK_WIDTH,
  PANEL_SHARE_BAR_HEIGHT,
  PANEL_SHARE_IDLE_RATIO,
  PANEL_SHARE_LABEL_CHAR_WIDTH,
  PANEL_SHARE_LABEL_PADDING,
  PANEL_STACK_GAP,
  PANEL_SWATCH_SIZE,
  PANEL_TAB_ID,
  PANEL_TAB_ORDER,
  PANEL_TABLE_CPU_WIDTH,
  PANEL_TABLE_MEMORY_WIDTH,
  PANEL_TABLE_PARENT_WIDTH,
  PANEL_TABLE_PID_WIDTH,
  PANEL_TABLE_SESSION_COUNT_WIDTH,
  PANEL_TOTAL_VALUE_WIDTH,
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

/** 分组表与堆叠条的一项(进程维度为单个进程,对话维度为一个会话/宿主/未归因) */
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

/** 进程显示名(缺失时退化为 pid) */
function displayName(sample: ResourceSample): string {
  return sample.handle.name ?? String(sample.handle.pid)
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

/** 卡片头部:维度标题 + 右侧计数 */
const cardHeadStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 10px',
  borderBottom: '1px solid var(--dsw-alias-border-l1)',
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
 * 资源占比条(单行):
 * 右端固定 `PANEL_SHARE_IDLE_RATIO` 宽度为空闲段(轨道底色,不随真实空闲量变化),
 * 左端其余宽度由已用项按相对占比铺满;段标签在段宽容得下文字且取整占比不小于 1% 时显示。
 */
function ShareBar(props: {
  groups: readonly ShareGroup[]
  pick: (group: ShareGroup) => number
  total: number
  width: number
  label: string
  idleLabel: string
}): ReactNode {
  // 合计超过 100%(多核噪声或汇报句柄越界)时按比例缩放,保证不溢出轨道
  const scale = props.total > 100 ? 100 / props.total : 1
  const usedRatio = 1 - PANEL_SHARE_IDLE_RATIO
  const usedWidth = `${usedRatio * 100}%`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: 0 }}>
      <div
        role="img"
        aria-label={`${props.label} ${formatPercent(props.total)}`}
        style={{
          display: 'flex',
          height: PANEL_SHARE_BAR_HEIGHT,
          borderRadius: 999,
          background: 'var(--dsw-alias-interactive-bg-hover)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', flex: `0 0 ${usedWidth}`, minWidth: 0 }}>
          {props.groups.map((group, index) => {
            const value = props.pick(group)
            if (value <= 0) return null
            return (
              <div
                key={group.key}
                title={`${group.label} ${formatPercent(value)}`}
                style={{ flexGrow: value * scale, flexBasis: 0, background: seriesColor(index) }}
              />
            )
          })}
        </div>
        <div title={props.idleLabel} style={{ flex: '1 1 auto' }} />
      </div>
      {/* 段标签行:与已用区同构,高度固定以免标签全部隐藏时行高跳动 */}
      <div style={{ display: 'flex', width: '100%', height: 18 }}>
        <div style={{ display: 'flex', flex: `0 0 ${usedWidth}`, minWidth: 0 }}>
          {props.groups.map((group) => {
            const value = props.pick(group)
            const share = props.total > 0 ? (value / props.total) * 100 : 0
            const rounded = Math.round(share)
            const text = rounded >= 1 ? `${rounded}%` : ''
            const segmentWidth = usedRatio * props.width * (props.total > 0 ? value / props.total : 0)
            const fits = text.length > 0 &&
              segmentWidth >= text.length * PANEL_SHARE_LABEL_CHAR_WIDTH + PANEL_SHARE_LABEL_PADDING
            return (
              <div
                key={group.key}
                style={{
                  flexGrow: value * scale,
                  flexBasis: 0,
                  minWidth: 0,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                  color: 'var(--dsw-alias-label-tertiary)',
                  fontVariantNumeric: 'tabular-nums',
                  ...PANEL_TYPOGRAPHY.caption,
                }}
              >
                {fits ? text : ''}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** 一行资源占比:指标名 + 占比条 + 合计数值 */
function ShareRow(props: {
  label: string
  groups: readonly ShareGroup[]
  pick: (group: ShareGroup) => number
  width: number
  totalLabel: string
  idleLabel: string
}): ReactNode {
  const total = props.groups.reduce((sum, group) => sum + props.pick(group), 0)
  const high = total > PANEL_HIGH_LOAD_THRESHOLD
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
      <span style={{ width: PANEL_CHART_LABEL_WIDTH, flex: 'none', color: 'var(--dsw-alias-label-secondary)', ...PANEL_TYPOGRAPHY.caption }}>
        {props.label}
      </span>
      <ShareBar groups={props.groups} pick={props.pick} total={total} width={props.width} label={props.label} idleLabel={props.idleLabel} />
      <span
        title={props.totalLabel}
        style={{
          width: PANEL_TOTAL_VALUE_WIDTH,
          flex: 'none',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          color: high ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-secondary)',
          ...PANEL_TYPOGRAPHY.caption,
        }}
      >
        {formatPercent(total)}
      </span>
    </div>
  )
}

/**
 * 维度卡片:标题 + 计数 + CPU/内存两条占比条 + 该维度的明细表。
 * 条宽按卡片实测宽度推导(标签列与合计列之外的剩余宽度)。
 */
function DimensionCard(props: {
  title: string
  countText: string
  groups: readonly ShareGroup[]
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
      const bodyWidth = element.clientWidth
      // 行内三段:指标名列 + 条 + 合计列,两处 gap 各 10px
      const next = bodyWidth - PANEL_CHART_LABEL_WIDTH - PANEL_TOTAL_VALUE_WIDTH - 20
      if (next > 0) setWidth(next)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div style={cardStyle}>
      <div style={cardHeadStyle}>
        <span style={{ color: 'var(--dsw-alias-label-secondary)', ...PANEL_TYPOGRAPHY.baseStrong }}>{props.title}</span>
        <span style={{ color: 'var(--dsw-alias-label-caption)', fontVariantNumeric: 'tabular-nums', ...PANEL_TYPOGRAPHY.caption }}>
          {props.countText}
        </span>
      </div>
      <div ref={bodyRef} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px' }}>
        <ShareRow
          label={props.t('table.column.cpu')}
          groups={props.groups}
          pick={(group) => group.cpuPercent}
          width={width}
          totalLabel={props.t('chart.total')}
          idleLabel={props.t('chart.idle')}
        />
        <ShareRow
          label={props.t('table.column.memory')}
          groups={props.groups}
          pick={(group) => group.memoryPercent}
          width={width}
          totalLabel={props.t('chart.total')}
          idleLabel={props.t('chart.idle')}
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
    const tick = async (): Promise<void> => {
      try {
        const response = await fetch(MONITOR_DATA_PATH, { cache: 'no-store' })
        if (!response.ok) throw new Error(String(response.status))
        const data = (await response.json()) as MonitorSnapshot
        if (!alive) return
        setSnapshot(data)
        setUnavailable(false)
      } catch {
        if (!alive) return
        setUnavailable(true)
      }
    }
    void tick()
    const timer = setInterval(() => void tick(), CLIENT_POLL_INTERVAL)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  /**
   * 面板可展示以"存在采样"为前提:采集器尚未产出首份快照时,
   * 数据端点返回 200 + 占位快照(sampledAt 为 0,另带 error 说明)。
   * 若把占位响应当有效数据渲染,面板会显示 1970 年采样时间与全 0 指标,
   * 因此占位响应与轮询失败一律按数据源不可用处理。
   */
  const sampled = snapshot !== null && snapshot.sampledAt > 0

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
  const summary: { key: 'summary.sampledAt' | 'summary.platform' | 'summary.pollInterval' | 'summary.cpuCount' | 'summary.totalMemory' | 'summary.rootPid'; value: string }[] = [
    { key: 'summary.sampledAt', value: formatDateTime(snapshot.sampledAt) },
    { key: 'summary.platform', value: snapshot.platform || t('summary.platformUnknown') },
    { key: 'summary.pollInterval', value: `${snapshot.pollInterval}ms` },
    { key: 'summary.cpuCount', value: String(snapshot.cpuCount) },
    { key: 'summary.totalMemory', value: formatBytes(snapshot.totalMemoryBytes) },
    { key: 'summary.rootPid', value: String(snapshot.rootPid) },
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
