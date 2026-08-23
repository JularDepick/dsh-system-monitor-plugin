/*
 * 客户端插件:会话区域「系统监控」tab
 *
 * 经 conversation.view 槽注册浏览器端面板组件,
 * 通过 host webserver 数据端点同源轮询快照并展示。
 * 视觉遵循宿主 --dsw-alias-* 语义 token,适配明暗主题。
 * 作者:JularDepick
 */

import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
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

/** 根容器样式 */
const rootStyle: CSSProperties = { padding: '16px 20px' }

/** 单元格基础样式(守则:表格默认水平居中) */
const cellStyle: CSSProperties = { padding: '7px 10px', fontSize: 13, lineHeight: 20, textAlign: 'center' }

/** 表头单元格样式 */
const headCellStyle: CSSProperties = {
  ...cellStyle,
  color: 'var(--dsw-alias-label-secondary)',
  fontWeight: 500,
  borderBottom: '1px solid var(--dsw-alias-border-l2)',
}

/** 数据单元格样式 */
const dataCellStyle: CSSProperties = { ...cellStyle, color: 'var(--dsw-alias-label-primary)' }

/** 状态徽章样式 */
const badgeStyle = (tone: 'ok' | 'warn' | 'error'): CSSProperties => {
  const pair = tone === 'warn'
    ? { color: 'var(--dsw-alias-state-warn-primary)', background: 'var(--dsw-alias-state-warn-tertiary)' }
    : tone === 'error'
      ? { color: 'var(--dsw-alias-state-error-primary)', background: 'var(--dsw-alias-interactive-bg-hover)' }
      : { color: 'var(--dsw-alias-state-success-primary)', background: 'var(--dsw-alias-interactive-bg-hover)' }
  return {
    ...pair,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    whiteSpace: 'nowrap',
    borderRadius: 999,
    padding: '2px 8px',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: 500,
  }
}

/** 占用进度条:轨道 + 填充 + 数值文本(数值不以颜色为唯一表意) */
function UsageBar(props: { value: number; high: boolean; text: string; label: string }): ReactNode {
  const clamped = Math.min(100, Math.max(0, props.value))
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center', minWidth: 140 }}>
      <div
        style={{
          width: 72,
          height: 4,
          borderRadius: 2,
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
            background: props.high ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-business-primary)',
            transition: 'width 200ms ease-out',
          }}
        />
      </div>
      <span style={{ fontVariantNumeric: 'tabular-nums', color: props.high ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-primary)', fontSize: 13, lineHeight: 20 }}>
        {props.text}
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
      <div style={rootStyle}>
        {[0, 1, 2].map((index) => (
          <div key={index} className="sm-skeleton" style={{ height: 20, borderRadius: 4, marginBottom: 8 }} />
        ))}
        <style>{panelCss}</style>
      </div>
    )
  }

  // 数据源不可用且无旧快照:错误态(自动轮询重试)
  if (!snapshot) {
    return (
      <div style={rootStyle}>
        <div
          style={{
            color: 'var(--dsw-alias-state-error-primary)',
            fontSize: 13,
            lineHeight: 20,
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid var(--dsw-alias-border-l1)',
            background: 'var(--dsw-alias-interactive-bg-hover)',
          }}
        >
          监控数据源不可用,将自动重试
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
    <div style={rootStyle}>
      <style>{panelCss}</style>
      {/* 概览:KPI 与状态 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ color: 'var(--dsw-alias-label-primary)', fontSize: 24, lineHeight: 32, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {processes.length}
          </span>
          <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: 18 }}>被监控进程</span>
        </div>
        {snapshot.degraded ? (
          <span style={badgeStyle('warn')} title="数据来源降级,进程树关系不可用">
            降级模式
          </span>
        ) : (
          <span style={badgeStyle('ok')}>正常</span>
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
          marginBottom: 12,
        }}
      >
        {summary.map((item) => (
          <span key={item.label}>
            {item.label}:
            <span style={{ color: 'var(--dsw-alias-label-secondary)', fontVariantNumeric: 'tabular-nums' }}> {item.value}</span>
          </span>
        ))}
      </div>
      {/* 进程表 */}
      {processes.length === 0 ? (
        <div
          style={{
            color: 'var(--dsw-alias-label-tertiary)',
            fontSize: 13,
            lineHeight: 20,
            textAlign: 'center',
            padding: '24px 0',
          }}
        >
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
            {processes.map((sample: ResourceSample, index: number) => {
              const cpuHigh = sample.cpuPercent > PANEL_HIGH_LOAD_THRESHOLD
              const memoryHigh = sample.memoryPercent > PANEL_HIGH_LOAD_THRESHOLD
              return (
                <tr
                  key={sample.handle.pid}
                  style={{
                    borderBottom: '1px solid var(--dsw-alias-border-l1)',
                    background: index % 2 === 1 ? 'var(--dsw-alias-interactive-bg-hover)' : undefined,
                  }}
                >
                  <td style={dataCellStyle}>{sample.handle.name ?? ''}</td>
                  <td style={dataCellStyle}>{sample.handle.pid}</td>
                  <td style={dataCellStyle}>{sample.handle.parentPid ?? ''}</td>
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
      {/* 页脚作者信息 */}
      <div
        style={{
          marginTop: 12,
          color: 'var(--dsw-alias-label-caption)',
          fontSize: 12,
          lineHeight: 18,
          textAlign: 'center',
        }}
      >
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