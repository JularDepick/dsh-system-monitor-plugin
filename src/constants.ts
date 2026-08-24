/*
 * 全局常量与设计细节
 *
 * 可个性化修改但不影响核心功能的设计细节统一在此处隔离存放,
 * 具体索引同步登记于 AGENTS.md 设计细节段。
 * 作者:JularDepick
 */

/** 插件包名 */
export const PLUGIN_NAME = 'dsh-system-monitor-plugin'

/** 默认语言(翻译回退与初始语言) */
export const DEFAULT_LANGUAGE = 'zh-CN'

/** 回退语言,翻译未命中时使用 */
export const FALLBACK_LANGUAGE = 'zh-CN'

/** 翻译文件目录,相对插件包根目录 */
export const TRANSLATION_DIR = 'src/translation'

/** 资源采集轮询间隔默认值(毫秒) */
export const DEFAULT_POLL_INTERVAL = 1000

/** Agent 汇报进程句柄的工具名称 */
export const REPORT_TOOL_NAME = 'system_monitor_report'

/** 系统进程查询超时(毫秒) */
export const QUERY_TIMEOUT_MS = 10000

/** Linux 时钟节拍(/proc stat 时间字段单位,标准 USER_HZ) */
export const LINUX_CLK_TCK = 100

/** 面板数据端点路径(host webserver 路由,浏览器端同源轮询) */
export const MONITOR_DATA_PATH = '/api/system-monitor/snapshot'

/** 客户端 tab 轮询间隔(毫秒,与采集轮询默认值一致) */
export const CLIENT_POLL_INTERVAL = 1000

/** 会话区域 tab 标识(conversation.view 槽注册 id) */
export const PANEL_TAB_ID = 'system-monitor'

/** 会话区域 tab 排序(位于「对话」「轨迹」之后) */
export const PANEL_TAB_ORDER = 30

/** 面板页脚作者信息(便于动态替换) */
export const PANEL_AUTHOR = 'JularDepick'

/** 面板页脚作者主页链接(便于动态替换) */
export const PANEL_AUTHOR_URL = 'https://github.com/JularDepick'

/** 面板页脚项目仓库链接(便于动态替换) */
export const PANEL_PROJECT_URL = 'https://github.com/JularDepick/dsh-system-monitor-plugin'

/** 面板高占用警示阈值(百分比,CPU 或内存占用超过时高亮) */
export const PANEL_HIGH_LOAD_THRESHOLD = 90