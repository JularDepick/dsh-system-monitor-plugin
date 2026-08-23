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
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  CLIENT_POLL_INTERVAL,
  MONITOR_DATA_PATH,
  PANEL_AUTHOR,
  PANEL_HIGH_LOAD_THRESHOLD,
  PANEL_TAB_ID,
  PANEL_TAB_LABEL_EN,
  PANEL_TAB_LABEL_ZH,
  PANEL_TAB_ORDER,
  PLUGIN_NAME,
} from '../constants'
import type { MonitorSnapshot, ResourceSample } from '../monitor/types'

/** tab 显示名,跟随界面语言 */
function tabLabel(): string {
  if (typeof navigator !== 'undefined' && /^zh/i.test(navigator.language)) return PANEL_TAB_LABEL_ZH
  return PANEL_TAB_LABEL_EN
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
`

/** 内容列:宽度与宿主对话区一致 */
const columnStyle: CSSProperties = {
  maxWidth: 'var(--dsh-chat-content-width)',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '16px calc(var(--dsh-composer-side-clearance) + 16px) 24px',
}

/** 卡片容器:与原版卡片一致(圆角、边框、内边距) */
const cardStyle: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l1)',
  borderRadius: 12,
  overflow: 'hidden',
}

/** 表格数据单元格(守则:表格默认水平居中) */
const cellStyle: CSSProperties = { padding: '7px 10px', fontSize: 13, lineHeight: 20, textAlign: 'center' }

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
      ? 'var(--dsw-alias-state-warn-primary)'
      : 'var(--dsw-alias-state-error-primary)'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color,
        fontSize: 12,
        lineHeight: 18,
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      <StateDot state={state} size={8} />
      {props.label}
    </span>
  )
}

/** 占用进度条:原版 meter 栏(4px 圆角轨道)+ 数值文本(数值不以颜色为唯一表意) */
function UsageBar(props: { value: number; high: boolean; text: string; label: string }): ReactNode {
  const clamped = Math.min(100, Math.max(0, props.value))
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        justifyContent: 'center',
        color: props.high ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-secondary)',
        fontSize: 12,
        lineHeight: 18,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <div
        style={{
          width: 64,
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
      <span>{props.text}</span>
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
        padding: '10px 16px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      }}
    >
      <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: 20, fontWeight: 500 }}>
        进程资源
      </span>
      <span style={{ color: 'var(--dsw-alias-label-caption)', fontSize: 12, lineHeight: 18, fontVariantNumeric: 'tabular-nums' }}>
        {props.processes} 个进程
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
      <div style={columnStyle}>
        {[0, 1, 2].map((index) => (
          <div key={index} className="sm-skeleton" style={{ height: 84, borderRadius: 12 }} />
        ))}
        <style>{panelCss}</style>
      </div>
    )
  }

  // 数据源不可用且无旧快照:警告条(自动轮询重试)
  if (!snapshot) {
    return (
      <div style={columnStyle}>
        <div style={{ ...cardStyle, background: 'var(--dsw-alias-state-warn-tertiary)', padding: '10px 14px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--dsw-alias-state-warn-primary)', fontSize: 13, lineHeight: 20 }}>
            <StateDot state="warning" size={8} />
            监控数据源不可用,将自动重试
          </span>
        </div>
        <style>{panelCss}</style>
      </div>
    )
  }

  const processes = snapshot.processes
  const summary: { label: string; value: string }[] = [
    { label: '采样时间', value: formatDateTime(snapshot.sampledAt) },
    { label: '平台', value: snapshot.platform || '未知' },
    { label: '轮询间隔', value: `${snapshot.pollInterval}ms` },
    { label: '逻辑处理器', value: String(snapshot.cpuCount) },
    { label: '总内存', value: `${formatGigabytes(snapshot.totalMemoryBytes)}GB` },
    { label: 'dsh 进程', value: String(snapshot.rootPid) },
  ]

  return (
    <div style={columnStyle}>
      <style>{panelCss}</style>
      {/* 统计卡:KPI 与状态 */}
      <div style={{ ...cardStyle, background: 'var(--dsw-alias-interactive-bg-hover)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{ color: 'var(--dsw-alias-label-primary)', fontSize: 24, lineHeight: 32, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {processes.length}
          </span>
          <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: 18 }}>被监控进程</span>
        </div>
        {snapshot.degraded ? (
          <StatusBadge tone="warn" label="降级模式" />
        ) : (
          <StatusBadge tone="ok" label="正常" />
        )}
      </div>
      {/* 系统信息行 */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '2px 16px',
          color: 'var(--dsw-alias-label-tertiary)',
          fontSize: 12,
          lineHeight: 18,
        }}
      >
        {summary.map((item) => (
          <span key={item.label}>
            {item.label}:
            <span style={{ color: 'var(--dsw-alias-label-secondary)', fontVariantNumeric: 'tabular-nums' }}> {item.value}</span>
          </span>
        ))}
      </div>
      {/* 进程表卡 */}
      <div style={cardStyle}>
        <TableHeader processes={processes.length} />
        {processes.length === 0 ? (
          <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, lineHeight: 20, textAlign: 'center', padding: '28px 0' }}>
            暂无被监控进程
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="系统监控进程资源占用表">
            <thead>
              <tr>
                <th scope="col" style={headCellStyle}>进程名</th>
                <th scope="col" style={headCellStyle}>PID</th>
                <th scope="col" style={headCellStyle}>父进程</th>
                <th scope="col" style={headCellStyle}>CPU</th>
                <th scope="col" style={headCellStyle}>内存</th>
              </tr>
            </thead>
            <tbody>
              {processes.map((sample: ResourceSample) => {
                const cpuHigh = sample.cpuPercent > PANEL_HIGH_LOAD_THRESHOLD
                const memoryHigh = sample.memoryPercent > PANEL_HIGH_LOAD_THRESHOLD
                return (
                  <tr key={sample.handle.pid} style={{ borderBottom: '1px solid var(--dsw-alias-border-l1)' }}>
                    <td style={dataCellStyle}>{sample.handle.name ?? ''}</td>
                    <td style={{ ...dataCellStyle, fontVariantNumeric: 'tabular-nums' }}>{sample.handle.pid}</td>
                    <td style={{ ...dataCellStyle, fontVariantNumeric: 'tabular-nums' }}>{sample.handle.parentPid ?? ''}</td>
                    <td style={dataCellStyle}>
                      <UsageBar value={sample.cpuPercent} high={cpuHigh} text={formatPercent(sample.cpuPercent)} label={`${sample.handle.name ?? sample.handle.pid} CPU 占用率`} />
                    </td>
                    <td style={dataCellStyle}>
                      <UsageBar
                        value={sample.memoryPercent}
                        high={memoryHigh}
                        text={`${formatGigabytes(sample.memoryBytes)}GB · ${formatPercent(sample.memoryPercent)}`}
                        label={`${sample.handle.name ?? sample.handle.pid} 内存占用率`}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {/* 页脚作者信息 */}
      <div style={{ color: 'var(--dsw-alias-label-caption)', fontSize: 12, lineHeight: 18, textAlign: 'center', paddingTop: 4 }}>
        {PLUGIN_NAME} · {PANEL_AUTHOR}
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