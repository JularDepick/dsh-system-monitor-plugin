/*
 * 客户端插件:会话区域「系统监控」tab
 *
 * 经 conversation.view 槽注册浏览器端面板组件,
 * 通过 host webserver 数据端点同源轮询快照并展示。
 * 视觉对齐 dsh web 原版风格:基准字号取宿主排版 token,
 * 颜色只用宿主语义 token 与静态色 token,明暗主题自适应。
 * 作者:JularDepick
 */

import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useState } from 'react'
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
  PANEL_SHARE_BAR_HEIGHT,
  PANEL_STACK_GAP,
  PANEL_SWATCH_SIZE,
  PANEL_TAB_ID,
  PANEL_TAB_ORDER,
  PANEL_TABLE_CPU_WIDTH,
  PANEL_TABLE_MEMORY_WIDTH,
  PANEL_TABLE_PARENT_WIDTH,
  PANEL_TABLE_PID_WIDTH,
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

/** 第 index 个被监控进程的分段配色(超出配色表长度后循环) */
function seriesColor(index: number): string {
  return PANEL_SERIES_COLORS[index % PANEL_SERIES_COLORS.length]
}

/** 进程显示名(缺失时退化为 pid) */
function displayName(sample: ResourceSample): string {
  return sample.handle.name ?? String(sample.handle.pid)
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
 * 字号与行高取宿主排版 token,基准字号与界面其余部分一致。
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

/** 卡片头部:标题 + 右侧说明 */
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
 * 资源占比堆叠条:整条进度条承载全部被监控进程,每段一色并带 title 提示,
 * 未占满部分保持轨道底色(即"未被监控进程占用"的余量)。
 * 各段用 flexGrow 表达占比,和为 100% 时正好铺满;极小占比段保留可见宽度由浏览器按比例处理。
 */
function ShareBar(props: {
  samples: ResourceSample[]
  pick: (sample: ResourceSample) => number
  total: number
  label: string
}): ReactNode {
  // 合计超过 100%(多核噪声或汇报句柄越界)时按比例缩放,保证不溢出轨道
  const scale = props.total > 100 ? 100 / props.total : 1
  return (
    <div
      role="img"
      aria-label={`${props.label} ${formatPercent(props.total)}`}
      style={{
        display: 'flex',
        flex: '1 1 auto',
        minWidth: 0,
        height: PANEL_SHARE_BAR_HEIGHT,
        borderRadius: 999,
        background: 'var(--dsw-alias-interactive-bg-hover)',
        overflow: 'hidden',
      }}
    >
      {props.samples.map((sample, index) => {
        const value = props.pick(sample)
        if (value <= 0) return null
        return (
          <div
            key={sample.handle.pid}
            title={`${displayName(sample)} ${formatPercent(value)}`}
            style={{ flexGrow: value * scale, flexBasis: 0, background: seriesColor(index) }}
          />
        )
      })}
      {/* 余量段:使各进程段之和小于 100% 时条不被拉满 */}
      <div style={{ flexGrow: Math.max(0, 100 - Math.min(100, props.total)), flexBasis: 0 }} />
    </div>
  )
}

/** 一行资源占比:指标名 + 堆叠条 + 合计数值 */
function ShareRow(props: {
  label: string
  samples: ResourceSample[]
  pick: (sample: ResourceSample) => number
  high: boolean
}): ReactNode {
  const total = props.samples.reduce((sum, sample) => sum + props.pick(sample), 0)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <span style={{ width: PANEL_CHART_LABEL_WIDTH, flex: 'none', color: 'var(--dsw-alias-label-secondary)', ...PANEL_TYPOGRAPHY.caption }}>
        {props.label}
      </span>
      <ShareBar samples={props.samples} pick={props.pick} total={total} label={props.label} />
      <span
        style={{
          width: PANEL_TOTAL_VALUE_WIDTH,
          flex: 'none',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          color: props.high ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-secondary)',
          ...PANEL_TYPOGRAPHY.caption,
        }}
      >
        {formatPercent(total)}
      </span>
    </div>
  )
}

/** 资源占比卡:CPU 与内存各一条统一堆叠条,按进程分段配色 */
function ShareChart(props: { samples: ResourceSample[]; t: PanelTranslate }): ReactNode {
  const cpuTotal = props.samples.reduce((sum, sample) => sum + sample.cpuPercent, 0)
  const memoryTotal = props.samples.reduce((sum, sample) => sum + sample.memoryPercent, 0)
  return (
    <div style={cardStyle}>
      <div style={cardHeadStyle}>
        <span style={{ color: 'var(--dsw-alias-label-secondary)', ...PANEL_TYPOGRAPHY.baseStrong }}>
          {props.t('chart.title')}
        </span>
        <span style={{ color: 'var(--dsw-alias-label-caption)', fontVariantNumeric: 'tabular-nums', ...PANEL_TYPOGRAPHY.caption }}>
          {props.t('chart.total')}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px' }}>
        <ShareRow label={props.t('table.column.cpu')} samples={props.samples} pick={(sample) => sample.cpuPercent} high={cpuTotal > PANEL_HIGH_LOAD_THRESHOLD} />
        <ShareRow label={props.t('table.column.memory')} samples={props.samples} pick={(sample) => sample.memoryPercent} high={memoryTotal > PANEL_HIGH_LOAD_THRESHOLD} />
      </div>
      {props.samples.length === 0 ? (
        <div style={{ color: 'var(--dsw-alias-label-tertiary)', textAlign: 'center', padding: '0 0 8px', ...PANEL_TYPOGRAPHY.caption }}>
          {props.t('empty.noProcesses')}
        </div>
      ) : null}
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
  const summary: { key: 'summary.sampledAt' | 'summary.platform' | 'summary.pollInterval' | 'summary.cpuCount' | 'summary.totalMemory' | 'summary.rootPid'; value: string }[] = [
    { key: 'summary.sampledAt', value: formatDateTime(snapshot.sampledAt) },
    { key: 'summary.platform', value: snapshot.platform || t('summary.platformUnknown') },
    { key: 'summary.pollInterval', value: `${snapshot.pollInterval}ms` },
    { key: 'summary.cpuCount', value: String(snapshot.cpuCount) },
    { key: 'summary.totalMemory', value: formatBytes(snapshot.totalMemoryBytes) },
    { key: 'summary.rootPid', value: String(snapshot.rootPid) },
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
      {/* 资源占比卡:一条统一堆叠条按进程分段,取代原先每进程独立的占比条 */}
      <ShareChart samples={processes} t={t} />
      {/* 进程表卡 */}
      <div style={cardStyle}>
        <div style={cardHeadStyle}>
          <span style={{ color: 'var(--dsw-alias-label-secondary)', ...PANEL_TYPOGRAPHY.baseStrong }}>
            {t('table.title')}
          </span>
          <span style={{ color: 'var(--dsw-alias-label-caption)', fontVariantNumeric: 'tabular-nums', ...PANEL_TYPOGRAPHY.caption }}>
            {t('table.count', { count: processes.length })}
          </span>
        </div>
        {processes.length === 0 ? (
          <div style={{ color: 'var(--dsw-alias-label-tertiary)', textAlign: 'center', padding: '10px 0', ...PANEL_TYPOGRAPHY.base }}>
            {t('empty.noProcesses')}
          </div>
        ) : (
          /*
           * 固定列宽策略:auto 布局下,超长进程名会重分配列宽并挤压 PID/父进程列,
           * 进而改变同行数值的左右边界。固定布局把列边界钉在 colgroup 上,
           * 进程名列取剩余宽度,超长名称以省略号截断(title 保留全文)。
           */
          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', borderSpacing: 0 }} aria-label={t('table.ariaLabel')}>
            <colgroup>
              <col />
              <col style={{ width: PANEL_TABLE_PID_WIDTH }} />
              <col style={{ width: PANEL_TABLE_PARENT_WIDTH }} />
              <col style={{ width: PANEL_TABLE_CPU_WIDTH }} />
              <col style={{ width: PANEL_TABLE_MEMORY_WIDTH }} />
            </colgroup>
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
                const name = displayName(sample)
                return (
                  <tr key={sample.handle.pid} style={{ borderBottom: last ? 'none' : '1px solid var(--dsw-alias-border-l1)' }}>
                    {/* 名称前的配色块与占比条分段同色,充当图例 */}
                    <td style={dataCellStyle} title={name}>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 0 }}>
                        <span
                          style={{
                            width: PANEL_SWATCH_SIZE,
                            height: PANEL_SWATCH_SIZE,
                            flex: 'none',
                            borderRadius: 3,
                            background: seriesColor(index),
                          }}
                        />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      </span>
                    </td>
                    <td style={{ ...dataCellStyle, fontVariantNumeric: 'tabular-nums' }}>{sample.handle.pid}</td>
                    <td style={{ ...dataCellStyle, fontVariantNumeric: 'tabular-nums' }}>{sample.handle.parentPid ?? ''}</td>
                    <td style={{ ...dataCellStyle, fontVariantNumeric: 'tabular-nums', color: cpuHigh ? 'var(--dsw-alias-state-error-primary)' : undefined }}>
                      {formatPercent(sample.cpuPercent)}
                    </td>
                    <td style={{ ...dataCellStyle, fontVariantNumeric: 'tabular-nums', color: memoryHigh ? 'var(--dsw-alias-state-error-primary)' : undefined }}>
                      {`${formatBytes(sample.memoryBytes)} · ${formatPercent(sample.memoryPercent)}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
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
