/*
 * 客户端面板文案字典(zh/en)
 *
 * 键集与 src/translation/*.ini 的 [translation] 节保持一致
 * (同步维护,冒烟测试断言双向一致);浏览器端无法读取 ini 文件,
 * 故以本字典随 client bundle 打包,按界面语言取文案,未命中回退中文。
 * 作者:JularDepick
 */

/** 界面语言 */
export type PanelLocale = 'zh' | 'en'

/** 中文文案(与 zh-CN.ini 同步) */
export const zhDictionary: Record<string, string> = {
  'tab.label': '系统监控',
  'stat.processes': '被监控进程',
  'stat.normal': '正常',
  'stat.degraded': '降级模式',
  'table.title': '进程资源',
  'table.count': '{count} 个进程',
  'table.column.process': '进程名',
  'table.column.pid': 'PID',
  'table.column.parent': '父进程',
  'table.column.cpu': 'CPU',
  'table.column.memory': '内存',
  'summary.sampledAt': '采样时间',
  'summary.platform': '平台',
  'summary.pollInterval': '轮询间隔',
  'summary.cpuCount': '逻辑处理器',
  'summary.totalMemory': '总内存',
  'summary.rootPid': 'dsh 进程',
  'empty.noProcesses': '暂无被监控进程',
  'error.unavailable': '监控数据源不可用,将自动重试',
  'aria.usage.cpu': '{name} CPU 占用率',
  'aria.usage.memory': '{name} 内存占用率',
}

/** 英文文案(与 en-US.ini 同步) */
export const enDictionary: Record<string, string> = {
  'tab.label': 'System Monitor',
  'stat.processes': 'monitored processes',
  'stat.normal': 'Normal',
  'stat.degraded': 'Degraded',
  'table.title': 'Process Resources',
  'table.count': '{count} processes',
  'table.column.process': 'Process',
  'table.column.pid': 'PID',
  'table.column.parent': 'Parent',
  'table.column.cpu': 'CPU',
  'table.column.memory': 'Memory',
  'summary.sampledAt': 'Sampled at',
  'summary.platform': 'Platform',
  'summary.pollInterval': 'Poll interval',
  'summary.cpuCount': 'Logical cores',
  'summary.totalMemory': 'Total memory',
  'summary.rootPid': 'dsh process',
  'empty.noProcesses': 'No monitored processes',
  'error.unavailable': 'Monitoring source unavailable, retrying',
  'aria.usage.cpu': 'CPU usage of {name}',
  'aria.usage.memory': 'Memory usage of {name}',
}

/** 字典表(回退语言为中文) */
const dictionaries: Record<PanelLocale, Record<string, string>> = {
  zh: zhDictionary,
  en: enDictionary,
}

/** 当前界面语言(浏览器环境按 navigator.language 判定) */
export function localeOf(): PanelLocale {
  if (typeof navigator !== 'undefined' && /^en/i.test(navigator.language)) return 'en'
  return 'zh'
}

/** 取翻译文本,支持 {key} 占位插值;未命中回退中文,再回退键名 */
export function t(key: string, params?: Record<string, string | number>): string {
  const locale = localeOf()
  let text = dictionaries[locale][key] ?? dictionaries.zh[key] ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}