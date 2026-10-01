/*
 * 客户端插件:会话区域「系统监控」tab
 *
 * 经 conversation.view 槽注册浏览器端面板组件,
 * 通过 host webserver 数据端点同源轮询快照并展示。
 * 视觉对齐 dsh web 原版风格:复用宿主 CSS 变量与官方语义 token
 * (内容列宽、卡片、状态点、间距、数字排布),明暗主题自适应。
 * 作者:JularDepick
 */

import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
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
  PANEL_COLUMN_GUTTER,
  PANEL_CPU_VALUE_WIDTH,
  PANEL_HIGH_LOAD_THRESHOLD,
  PANEL_MEMORY_VALUE_WIDTH,
  PANEL_PROJECT_URL,
  PANEL_STACK_GAP,
  PANEL_TAB_ID,
  PANEL_TAB_ORDER,
  PANEL_TOP_PADDING,
  PLUGIN_NAME,
} from '../constants'
import { t } from './i18n'
import type { MonitorSnapshot, ResourceSample } from '../monitor/types'

/** tab 显示名,跟随界面语言 */
function tabLabel(): string {
  return t('tab.label')
}

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

/** 字节数换算为 GB 字符串 */
function formatGigabytes(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(2)
}

/** 百分比字符串 */
function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
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
 * 内容宽与宿主对话列一致(max-width 额外加左右 gutter,窗口更窄时由 gutter 兜底);
 * flex/minHeight/overflow 使宿主 composer-overlay 模式(视图区定高且 overflow:hidden)
 * 下面板自身成为滚动容器,长进程列表不会被裁掉。
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
  fontSize: 13,
  lineHeight: '20px',
  color: 'var(--dsw-alias-label-primary)',
  textAlign: 'left',
}

/** 卡片容器:与原版卡片一致(圆角、边框、内边距) */
const cardStyle: CSSProperties = {
  boxSizing: 'border-box',
  border: '1px solid var(--dsw-alias-border-l1)',
  borderRadius: 12,
  overflow: 'hidden',
}

/** 表格数据单元格(守则:表格默认水平居中;对齐官方 30px 紧凑行;显式盒模型防宿主继承) */
const cellStyle: CSSProperties = {
  boxSizing: 'border-box',
  padding: '2px 6px',
  fontSize: 13,
  lineHeight: '15px',
  textAlign: 'center',
  fontFamily: 'inherit',
}

/** 表头单元格 */
const headCellStyle: CSSProperties = {
  ...cellStyle,
  color: 'var(--dsw-alias-label-tertiary)',
  fontWeight: 500,
  borderBottom: '1px solid var(--dsw-alias-border-l2)',
}

/** 数据单元格 */
const dataCellStyle: CSSProperties = { ...cellStyle, color: 'var(--dsw-alias-label-primary)' }

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
        fontSize: 12,
        lineHeight: '14px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      <StateDot state={state} size={8} />
      {props.label}
    </span>
  )
}

/**
 * 占用进度条:原版 meter 栏(4px 圆角轨道)+ 数值文本(数值不以颜色为唯一表意)。
 * 容器用块级 flex 而非行内级 flex:行内级 flex 的基线取自第一个子项,
 * 而首项是无文本的轨道,基线退化为轨道底边,会把整组下推并撑高行框。
 * 数值槽宽度固定且右对齐,进度条左右边界因此不随数值位数逐行漂移。
 */
function UsageBar(props: {
  value: number
  high: boolean
  text: string
  label: string
  valueWidth: number
}): ReactNode {
  const clamped = Math.min(100, Math.max(0, props.value))
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        justifyContent: 'center',
        height: 15,
        color: props.high ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-secondary)',
        fontSize: 11,
        lineHeight: '14px',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <div
        style={{
          width: 56,
          height: 4,
          borderRadius: 999,
          background: 'var(--dsw-alias-interactive-bg-hover)',
          overflow: 'hidden',
          flex: 'none',
        }}
      >
        <div
          role="progressbar"
          aria-label={props.label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(clamped)}
          style={{
            width: `${clamped}%`,
            height: '100%',
            borderRadius: 999,
            background: props.high ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-business-primary)',
            transition: 'width 200ms ease-out',
          }}
        />
      </div>
      <span style={{ width: props.valueWidth, textAlign: 'right', whiteSpace: 'nowrap' }}>{props.text}</span>
    </div>
  )
}

/** 表格卡头部:标题 + 计数 */
function TableHeader(props: { processes: number }): ReactNode {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 10px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      }}
    >
      <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: '15px', fontWeight: 500 }}>
        {t('table.title')}
      </span>
      <span style={{ color: 'var(--dsw-alias-label-caption)', fontSize: 11, lineHeight: '14px', fontVariantNumeric: 'tabular-nums' }}>
        {t('table.count', { count: props.processes })}
      </span>
    </div>
  )
}

/** 面板主组件 */
const MonitorTab = (_props: PropsRuntime<'conversation.view'>): ReactNode => {
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

  // 加载中:骨架屏占位
  if (!snapshot && !unavailable) {
    return (
      <div className="sm-column" style={columnStyle}>
        {[0, 1].map((index) => (
          <div key={index} className="sm-skeleton" style={{ height: 52, borderRadius: 12 }} />
        ))}
        <style>{panelCss}</style>
      </div>
    )
  }

  // 数据源不可用且无旧快照:警告条(自动轮询重试)
  if (!snapshot) {
    return (
      <div className="sm-column" style={columnStyle}>
        <div style={{ ...cardStyle, background: 'var(--dsw-alias-state-warn-tertiary)', padding: '6px 10px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--dsw-alias-state-warn-label)', fontSize: 13, lineHeight: '15px' }}>
            <StateDot state="warning" size={8} />
            {t('error.unavailable')}
          </span>
        </div>
        <style>{panelCss}</style>
      </div>
    )
  }

  const processes = snapshot.processes
  const summary: { key: string; value: string }[] = [
    { key: 'summary.sampledAt', value: formatDateTime(snapshot.sampledAt) },
    { key: 'summary.platform', value: snapshot.platform || t('summary.platformUnknown') },
    { key: 'summary.pollInterval', value: `${snapshot.pollInterval}ms` },
    { key: 'summary.cpuCount', value: String(snapshot.cpuCount) },
    { key: 'summary.totalMemory', value: `${formatGigabytes(snapshot.totalMemoryBytes)}GB` },
    { key: 'summary.rootPid', value: String(snapshot.rootPid) },
  ]

  return (
    <div className="sm-column" style={columnStyle}>
      <style>{panelCss}</style>
      {/* 统计卡:KPI 与状态(静态面色用层级 token,不用交互态 hover token) */}
      <div style={{ ...cardStyle, background: 'var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2, var(--dsw-alias-interactive-bg-hover)))', padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{ color: 'var(--dsw-alias-label-primary)', fontSize: 20, lineHeight: '22px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {processes.length}
          </span>
          <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '14px' }}>{t('stat.processes')}</span>
        </div>
        {snapshot.degraded ? (
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
          fontSize: 11,
          lineHeight: '14px',
        }}
      >
        {summary.map((item) => (
          <span key={item.key}>
            {t(item.key)}:
            <span style={{ color: 'var(--dsw-alias-label-secondary)', fontVariantNumeric: 'tabular-nums' }}> {item.value}</span>
          </span>
        ))}
      </div>
      {/* 进程表卡 */}
      <div style={cardStyle}>
        <TableHeader processes={processes.length} />
        {processes.length === 0 ? (
          <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, lineHeight: '15px', textAlign: 'center', padding: '10px 0' }}>
            {t('empty.noProcesses')}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', borderSpacing: 0 }} aria-label={t('table.ariaLabel')}>
            <thead>
              <tr>
                <th scope="col" style={headCellStyle}>{t('table.column.process')}</th>
                <th scope="col" style={headCellStyle}>{t('table.column.pid')}</th>
                <th scope="col" style={headCellStyle}>{t('table.column.parent')}</th>
                <th scope="col" style={headCellStyle}>{t('table.column.cpu')}</th>
                <th scope="col" style={headCellStyle}>{t('table.column.memory')}</th>
              </tr>
            </thead>
            <tbody>
              {processes.map((sample: ResourceSample, index: number) => {
                const cpuHigh = sample.cpuPercent > PANEL_HIGH_LOAD_THRESHOLD
                const memoryHigh = sample.memoryPercent > PANEL_HIGH_LOAD_THRESHOLD
                const last = index === processes.length - 1
                return (
                  <tr key={sample.handle.pid} style={{ borderBottom: last ? 'none' : '1px solid var(--dsw-alias-border-l1)' }}>
                    <td style={dataCellStyle}>{sample.handle.name ?? ''}</td>
                    <td style={{ ...dataCellStyle, fontVariantNumeric: 'tabular-nums' }}>{sample.handle.pid}</td>
                    <td style={{ ...dataCellStyle, fontVariantNumeric: 'tabular-nums' }}>{sample.handle.parentPid ?? ''}</td>
                    <td style={dataCellStyle}>
                      <UsageBar value={sample.cpuPercent} high={cpuHigh} text={formatPercent(sample.cpuPercent)} valueWidth={PANEL_CPU_VALUE_WIDTH} label={t('aria.usage.cpu', { name: sample.handle.name ?? sample.handle.pid })} />
                    </td>
                    <td style={dataCellStyle}>
                      <UsageBar
                        value={sample.memoryPercent}
                        high={memoryHigh}
                        text={`${formatGigabytes(sample.memoryBytes)}GB · ${formatPercent(sample.memoryPercent)}`}
                        valueWidth={PANEL_MEMORY_VALUE_WIDTH}
                        label={t('aria.usage.memory', { name: sample.handle.name ?? sample.handle.pid })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {/* 页脚:项目与作者链接 */}
      <div style={{ color: 'var(--dsw-alias-label-caption)', fontSize: 11, lineHeight: '14px', textAlign: 'center' }}>
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

/** 客户端插件依赖的服务 */
export const inject = ['slots']

/** 注册会话区域「系统监控」tab */
export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: PANEL_TAB_ID,
    order: PANEL_TAB_ORDER,
    label: () => tabLabel(),
  }, MonitorTab))
}