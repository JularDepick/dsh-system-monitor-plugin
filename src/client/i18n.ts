/*
 * 客户端面板文案字典(zh/en)
 *
 * 字典以 PANEL_LOCALE_NAMESPACE 命名空间注册进宿主 locale 服务,
 * 组件经 conversation.view 注册声明的 locale 座位取框架注入的 t,
 * 文案因此跟随 dsh 界面语言(而非浏览器语言),语言切换由宿主重建座位;
 * 键集与 src/translation/*.ini 的 [translation] 节保持一致
 * (同步维护,冒烟测试断言双向一致);未命中回退宿主语言链(最终英文)。
 * 作者:JularDepick
 */

// 类型面:LocaleNamespaceMap 声明合并(把面板字典键域登记进槽系统的 locale 座位)
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** 中文文案(与 zh-CN.ini 同步) */
export const zhDictionary = {
  'tab.label': '系统监控',
  'stat.processes': '被监控进程',
  'stat.normal': '正常',
  'stat.degraded': '降级模式',
  'stat.unavailable': '数据源不可用',
  'chart.total': '合计',
  'chart.headerTotal': '{metric} 合计 {value}',
  'chart.others': '其他',
  'chart.dsh': 'DSH 及其子进程',
  'chart.idle': '空闲',
  'config.open': '配置',
  'config.title': '配置',
  'config.laneNames': '泳道内名称',
  'config.layout': '面板布局',
  'config.layoutSide': '左右并列',
  'config.layoutStack': '上下同列',
  'config.hint': '按 ESC 关闭',
  'config.close': '关闭',
  'session.title': '对话资源',
  'session.count': '{count} 个对话',
  'session.column.session': '对话',
  'session.column.processes': '进程数',
  'session.host': 'dsh 宿主',
  'session.unattributed': '未归因',
  'session.subagent': '子会话',
  'table.title': '进程资源',
  'table.expand': '展开明细表',
  'table.collapse': '收起明细表',
  'table.ariaLabel': '系统监控进程资源占用表',
  'table.count': '{count} 个进程',
  'table.column.process': '进程名',
  'table.column.pid': 'PID',
  'table.column.parent': '父进程',
  'table.column.cpu': 'CPU',
  'table.column.memory': '内存',
  'summary.sampledAt': '采样时间',
  'summary.platform': '平台',
  'summary.platformUnknown': '未知',
  'summary.pollInterval': '轮询间隔',
  'summary.cpuCount': '逻辑处理器',
  'summary.totalMemory': '总内存',
  'summary.rootPid': 'dsh 进程',
  'summary.others': '其他应用进程',
  'empty.noProcesses': '暂无被监控进程',
  'error.unavailable': '监控数据源不可用,将自动重试',
  'aria.usage.cpu': '{name} CPU 占用率',
  'aria.usage.memory': '{name} 内存占用率',
} satisfies Record<string, string>

/** 英文文案(与 en-US.ini 同步) */
export const enDictionary = {
  'tab.label': 'System Monitor',
  'stat.processes': 'monitored processes',
  'stat.normal': 'Normal',
  'stat.degraded': 'Degraded',
  'stat.unavailable': 'Source unavailable',
  'chart.total': 'Total',
  'chart.headerTotal': '{metric} total {value}',
  'chart.others': 'Others',
  'chart.dsh': 'DSH and subprocesses',
  'chart.idle': 'Idle',
  'config.open': 'Settings',
  'config.title': 'Settings',
  'config.laneNames': 'Names inside lanes',
  'config.layout': 'Panel layout',
  'config.layoutSide': 'Side by side',
  'config.layoutStack': 'Stacked',
  'config.hint': 'Press ESC to close',
  'config.close': 'Close',
  'session.title': 'Session Resources',
  'session.count': '{count} sessions',
  'session.column.session': 'Session',
  'session.column.processes': 'Processes',
  'session.host': 'dsh host',
  'session.unattributed': 'Unattributed',
  'session.subagent': 'Sub-session',
  'table.title': 'Process Resources',
  'table.expand': 'Expand table',
  'table.collapse': 'Collapse table',
  'table.ariaLabel': 'System monitor process resource table',
  'table.count': '{count} processes',
  'table.column.process': 'Process',
  'table.column.pid': 'PID',
  'table.column.parent': 'Parent',
  'table.column.cpu': 'CPU',
  'table.column.memory': 'Memory',
  'summary.sampledAt': 'Sampled at',
  'summary.platform': 'Platform',
  'summary.platformUnknown': 'Unknown',
  'summary.pollInterval': 'Poll interval',
  'summary.cpuCount': 'Logical cores',
  'summary.totalMemory': 'Total memory',
  'summary.rootPid': 'dsh process',
  'summary.others': 'Other app processes',
  'empty.noProcesses': 'No monitored processes',
  'error.unavailable': 'Monitoring source unavailable, retrying',
  'aria.usage.cpu': 'CPU usage of {name}',
  'aria.usage.memory': 'Memory usage of {name}',
} satisfies Record<keyof typeof zhDictionary, string>

/** 面板文案键(取自中文基准字典) */
export type PanelTextKey = keyof typeof zhDictionary

/** 面板字典(按内置语言 id 组织,交宿主 locale 服务注册) */
export const panelDictionaries: Record<string, Record<string, string>> = {
  zh: zhDictionary,
  en: enDictionary,
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /**
     * 面板文案命名空间。
     * 声明合并的键必须是字面量,故此处与 `src/constants.ts` 的 `PANEL_LOCALE_NAMESPACE` 手工保持一致
     */
    'system-monitor': PanelTextKey
  }
}
