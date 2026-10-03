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

/** 面板文案字典命名空间(注册进宿主 locale 服务,文案随之跟随界面语言) */
export const PANEL_LOCALE_NAMESPACE = 'system-monitor'

/** 面板页脚作者信息(便于动态替换) */
export const PANEL_AUTHOR = 'JularDepick'

/** 面板页脚作者主页链接(便于动态替换) */
export const PANEL_AUTHOR_URL = 'https://github.com/JularDepick'

/** 面板页脚项目仓库链接(便于动态替换) */
export const PANEL_PROJECT_URL = 'https://github.com/JularDepick/dsh-system-monitor-plugin'

/** 面板高占用警示阈值(百分比,CPU 或内存占用超过时高亮) */
export const PANEL_HIGH_LOAD_THRESHOLD = 90

/** 面板内容区左右内边距(像素;宿主视图区不提供内边距,窗口窄于内容列宽时由它兜底留白) */
export const PANEL_COLUMN_GUTTER = 16

/** 面板顶部内边距(像素;分隔宿主标签栏下边框) */
export const PANEL_TOP_PADDING = 16

/** 面板底部内边距(像素) */
export const PANEL_BOTTOM_PADDING = 24

/** 面板区块纵向间距(像素) */
export const PANEL_STACK_GAP = 6

/**
 * 面板排版(字号与行高):直接取宿主排版 token,
 * 使面板基准字号与 dsh 界面一致并跟随宿主「内容字号」设置;
 * 回退值为宿主默认值(s-14 = 14px/22px,xxs-12 = 12px/18px,l-20 = 20px/28px)
 */
export const PANEL_TYPOGRAPHY = {
  /** 基准正文与表格(宿主 s-14) */
  base: { fontSize: 'var(--dsw-font-s-14-font-size, 14px)', lineHeight: 'var(--dsw-font-s-14-line-height, 22px)' },
  /** 基准正文强调(宿主 s-strong-14) */
  baseStrong: { fontSize: 'var(--dsw-font-s-strong-14-font-size, 14px)', lineHeight: 'var(--dsw-font-s-strong-14-line-height, 22px)', fontWeight: 500 },
  /** 次级说明与页脚(宿主 xxs-12) */
  caption: { fontSize: 'var(--dsw-font-xxs-12-font-size, 12px)', lineHeight: 'var(--dsw-font-xxs-12-line-height, 18px)' },
  /** 统计卡 KPI 数字(宿主 l-20) */
  kpi: { fontSize: 'var(--dsw-font-l-20-font-size, 20px)', lineHeight: 'var(--dsw-font-l-20-line-height, 28px)', fontWeight: 600 },
} as const

/**
 * 资源占比堆叠条的分段配色(按被监控进程顺序循环取用)。
 * 全部取自宿主静态色 token(主题包提供,明暗主题下均可辨),回退值为对应静态色默认值
 */
export const PANEL_SERIES_COLORS = [
  'var(--dsw-static-deepseek-500, #4176e6)',
  'var(--dsw-static-amber-400, #f7ad31)',
  'var(--dsw-static-green-500, #22c55e)',
  'var(--dsw-static-red-400, #f25a5a)',
  'var(--dsw-static-blue-400, #60a5fa)',
  'var(--dsw-static-deepseek-600, #4868b2)',
  'var(--dsw-static-amber-600, #dd8629)',
  'var(--dsw-static-green-400, #4ed17e)',
  'var(--dsw-static-red-600, #ec1313)',
  'var(--dsw-static-blue-600, #2563eb)',
  'var(--dsw-static-neutral-400, #a2a4a6)',
  'var(--dsw-static-deepseek-400, #7aaaff)',
]

/** 资源占比堆叠条高度(像素) */
export const PANEL_SHARE_BAR_HEIGHT = 14

/**
 * 堆叠条右端固定空闲段占比(0–1)。
 * dsh 自身占用通常很低,若空闲段按真实余量绘制,已用各段会被压得难以比较;
 * 故空闲段固定占整条的这一比例(右端),其余宽度由已用项按相对占比铺满。
 */
export const PANEL_SHARE_IDLE_RATIO = 0.2

/** 堆叠条段标签的字宽估算(像素,12px 等宽数字下约 7px/字符) */
export const PANEL_SHARE_LABEL_CHAR_WIDTH = 7

/** 堆叠条段标签的左右留白(像素,段宽需容下「文字宽 + 该留白」才显示标签) */
export const PANEL_SHARE_LABEL_PADDING = 4

/** 堆叠条宽度测量不可用时的回退值(像素,本地渲染/首帧测量前使用) */
export const PANEL_SHARE_BAR_FALLBACK_WIDTH = 600

/** 资源占比行左侧指标名宽度(像素,两行对齐) */
export const PANEL_CHART_LABEL_WIDTH = 44

/** 资源占比行右侧合计数值槽宽度(像素,右对齐,容纳 100.00%) */
export const PANEL_TOTAL_VALUE_WIDTH = 64

/** 进程名前的配色标识块边长(像素) */
export const PANEL_SWATCH_SIZE = 10

/** 表格数据单元格左右内边距(像素,固定列宽由此与数值文本宽度推导) */
export const PANEL_CELL_PADDING_X = 6

/** 进程表 PID 列宽(像素,固定列宽策略下不随内容变化) */
export const PANEL_TABLE_PID_WIDTH = 64

/** 进程表父进程列宽(像素,固定列宽策略下不随内容变化) */
export const PANEL_TABLE_PARENT_WIDTH = 72

/** 进程表 CPU 列宽(像素,容纳 100.00% 于基准字号) */
export const PANEL_TABLE_CPU_WIDTH = 76

/** 进程表内存列宽(像素,容纳「999.99GB · 100.00%」于基准字号) */
export const PANEL_TABLE_MEMORY_WIDTH = 168

/** 对话表进程数列宽(像素) */
export const PANEL_TABLE_SESSION_COUNT_WIDTH = 64