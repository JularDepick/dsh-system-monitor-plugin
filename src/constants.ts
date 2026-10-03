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

/**
 * 资源采集轮询间隔下限(毫秒):
 * 每轮采集在 Windows 与 macOS 上要派生一次查询进程,过小的间隔会让查询进程层层叠加,
 * 故配置面给出下界,越界在插件加载期响亮失败
 */
export const MIN_POLL_INTERVAL = 250

/** 泳道内名称显示开关的默认值(开启;由插件配置投影到面板载荷) */
export const DEFAULT_LANE_NAMES = true

/**
 * 面板视图列数:1 为单列(全部区域纵向排布),2 为双列(两列并列)
 */
export type PanelColumns = 1 | 2

/** 面板视图列数默认值(单列) */
export const DEFAULT_PANEL_COLUMNS: PanelColumns = 1

/** 面板本地偏好存储键(浏览器端记住用户在同页配置里的选择) */
export const PANEL_STORAGE_KEY = 'dsh-system-monitor:preferences'

/** Agent 汇报进程句柄的工具名称 */
export const REPORT_TOOL_NAME = 'system_monitor_report'

/** 系统进程查询超时(毫秒) */
export const QUERY_TIMEOUT_MS = 10000

/**
 * Linux 时钟节拍兜底值(/proc 时间字段单位,标准 USER_HZ):
 * 首次运行时会探测真实值并缓存(见 monitor/clock-ticks.ts),
 * 探测不可信或非 Linux 平台时用该值。
 */
export const LINUX_CLK_TCK = 100

/** 时钟节拍缓存目录(相对 DSH_HOME;插件自管状态文件,不进插件 Config schema) */
export const ENV_CACHE_DIR = 'system-monitor-plugin'

/** 时钟节拍缓存文件名 */
export const ENV_CACHE_FILE = 'env.json'

/** 时钟节拍可信下限(正整数刻度) */
export const CLK_TCK_MIN = 1

/** 时钟节拍可信上限(超出即视为探测异常) */
export const CLK_TCK_MAX = 10000

/** 两种探测法的相对偏差上限(超出则采信由 /proc 推算的值) */
export const CLK_TCK_PROBE_TOLERANCE = 0.05

/** 推算探测所需的最小开机时长(秒;过短则误差大,跳过推算) */
export const CLK_TCK_PROBE_MIN_UPTIME_SECONDS = 60

/**
 * 时钟节拍缓存格式版本:
 * 缓存一经写入会被长期复用,故推算口径或缓存结构变化时必须递增该值,
 * 让旧缓存自动失效并重新探测(避免把历史错误值一直沿用下去)。
 */
export const CLK_TCK_CACHE_VERSION = 2

/** 面板数据端点路径(host webserver 路由,浏览器端同源轮询) */
export const MONITOR_DATA_PATH = '/api/system-monitor/snapshot'

/** 客户端 tab 轮询间隔(毫秒,与采集轮询默认值一致) */
export const CLIENT_POLL_INTERVAL = 1000

/**
 * 数据端点在采集器尚未产出首份快照时的最长等待(毫秒):
 * 等首轮采集计算完成后再回答,浏览器端因此不会先拿到占位快照、把面板置空;
 * 等待超时后仍按占位快照回答,由面板按「无有效采样」处理并继续轮询。
 */
export const PANEL_FIRST_SAMPLE_WAIT_MS = QUERY_TIMEOUT_MS + 2000

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

/** 面板内容最大宽度(像素):tab 区域内尽量用满可用宽度,仅在超宽屏上收窄以免表格与占比条过度拉伸 */
export const PANEL_MAX_WIDTH = 1440

/** 面板区域栅格:列数由用户选择(单列或双列),列间距取 `PANEL_STACK_GAP` */

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
 * 资源占比堆叠条的分段配色(非主泳道成员按顺序循环取用)。
 * 全部取自宿主静态色 token(主题包提供,明暗主题下均可辨),回退值为对应静态色默认值;
 * 不含 deepseek 蓝色家族——品牌蓝固定留给主进程/宿主泳道(`PANEL_PRIMARY_COLOR`),避免混淆。
 */
export const PANEL_SERIES_COLORS = [
  'var(--dsw-static-amber-400, #f7ad31)',
  'var(--dsw-static-green-500, #22c55e)',
  'var(--dsw-static-red-400, #f25a5a)',
  'var(--dsw-static-amber-600, #dd8629)',
  'var(--dsw-static-green-400, #4ed17e)',
  'var(--dsw-static-red-600, #ec1313)',
  'var(--dsw-static-neutral-400, #a2a4a6)',
]

/** 主进程/宿主泳道的固定配色(继承 profile web 品牌蓝) */
export const PANEL_PRIMARY_COLOR = 'var(--dsw-alias-brand-primary, var(--dsw-static-deepseek-500, #4176e6))'

/** 资源占比条轨道底色(静态面色 token,不用交互态 hover token) */
export const PANEL_SHARE_TRACK_COLOR = 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-interactive-bg-hover))'

/** 右端「空闲」泳道底色(淡灰;不用纯白,避免与卡片底色混淆) */
export const PANEL_IDLE_COLOR = 'var(--dsw-alias-bg-layer-3, var(--dsw-alias-border-l1, #e5e6eb))'

/** 占比条外边框宽度(像素) */
export const PANEL_SHARE_BAR_BORDER_WIDTH = 1

/** 占比条外边框颜色(继承 profile web 的描边色) */
export const PANEL_SHARE_BAR_BORDER_COLOR = 'var(--dsw-alias-border-l1)'

/** 资源占比堆叠条高度(像素;含 1px 外边框) */
export const PANEL_SHARE_BAR_HEIGHT = 18

/**
 * 资源占比堆叠条高度(泳道内显示名称时,像素)。
 * 必须与 `PANEL_SHARE_BAR_HEIGHT` 相等:泳道高度恒定,不随名称开关跳动
 * (名称本身无内外边距、行高压到 1,不会把行高带进泳道)。
 */
export const PANEL_SHARE_BAR_HEIGHT_NAMED = PANEL_SHARE_BAR_HEIGHT

/**
 * 泳道内名称的留白(像素,0 表示文字与段边之间不留空):
 * 名称不参与段内外边距,避免其行高或内边距反过来影响泳道高度。
 */
export const PANEL_SHARE_NAME_PADDING = 0

/**
 * 泳道内名称文字色的判定阈值:
 * 白色相对分段底色的对比度不低于该值即用白字(优先白色),否则退回黑字。
 */
export const PANEL_SHARE_NAME_MIN_CONTRAST = 3

/** 配置子页设置行的最大宽度(像素):设置行只在舒适宽度内排布,避免标签与控件相距过远 */
export const PANEL_SETTINGS_WIDTH = 560

/**
 * 占比条三泳道宽度比例:左端「其他应用」、中段「dsh 及其子进程」、右端「空闲」。
 * 三段都是固定 UI 长度(不随真实占用变化),占用数值由各段标签给出,
 * 因此低占用时中段仍能清楚比较各进程/对话;中段按 dsh 成员相对占比分段。
 */
export const PANEL_SHARE_OTHERS_RATIO = 0.2

/** 占比条中段(dsh 及其子进程)宽度比例 */
export const PANEL_SHARE_DSH_RATIO = 0.6

/**
 * 中段单个成员的最大宽度比例(1/3):
 * 中段成员多于一个时,最大成员的 UI 宽度不得超过中段的这一比例,
 * 其余宽度由其余成员按各自占整机数值的比例分取;只有一个成员时才允许它独占中段。
 * 判定与分配都按该维度全部成员进行,CPU 与内存两行口径一致。
 */
export const PANEL_SHARE_MAX_SINGLE_RATIO = 1 / 3

/**
 * 中段每个成员的保底宽度比例(0.04):
 * 先给每个成员留一份保底宽度,剩余宽度再按数值比例分配,使零占用成员也有可见占位、
 * 中段任何情况下都被铺满;成员很多时保底会自动收窄,不超过「非最大者份额 ÷ 成员数」。
 */
export const PANEL_SHARE_MEMBER_MIN_RATIO = 0.04

/** 占比条右端(空闲)宽度比例 */
export const PANEL_SHARE_IDLE_RATIO = 0.2

/** 「其他应用」泳道配色(静态中性色,与 dsh 分段系列色区分) */
export const PANEL_OTHERS_COLOR = 'var(--dsw-static-neutral-400)'

/** 堆叠条段标签的字宽估算(像素,12px 等宽数字下约 7px/字符) */
export const PANEL_SHARE_LABEL_CHAR_WIDTH = 7

/** 中日韩字符的宽度估算(像素,基准字号下约整宽 14px;其余字符按拉丁字宽计) */
export const PANEL_TEXT_CJK_WIDTH = 14

/** 堆叠条段标签的左右留白(像素,段宽需容下「文字宽 + 该留白」才显示标签) */
export const PANEL_SHARE_LABEL_PADDING = 4

/** 堆叠条宽度测量不可用时的回退值(像素,本地渲染/首帧测量前使用) */
export const PANEL_SHARE_BAR_FALLBACK_WIDTH = 600

/** 资源占比行左侧指标名宽度(像素,两行对齐) */
export const PANEL_CHART_LABEL_WIDTH = 44

/** 进程名前的配色标识块边长(像素) */
export const PANEL_SWATCH_SIZE = 10

/** 表格数据单元格左右内边距(像素,固定列宽由此与数值文本宽度推导) */
export const PANEL_CELL_PADDING_X = 6

/**
 * 表格列宽为「内容自适应 + 富余按比例分配」:下列常量是各列的内容宽度下限(兜底),
 * 实际列宽先由该列最长内容(含表头文案)估出,再把表格富余宽度按各列内容宽度比例分给所有列。
 */
export const PANEL_TABLE_PID_WIDTH = 64

/** 进程表父进程列最小宽度(像素) */
export const PANEL_TABLE_PARENT_WIDTH = 72

/** 进程表会话名称列最小宽度(像素) */
export const PANEL_TABLE_SESSION_WIDTH = 140

/** 进程表 CPU 列最小宽度(像素) */
export const PANEL_TABLE_CPU_WIDTH = 76

/** 内存列(具体数值)最小宽度(像素) */
export const PANEL_TABLE_MEMORY_VALUE_WIDTH = 104

/** 内存列(占比)最小宽度(像素) */
export const PANEL_TABLE_MEMORY_PERCENT_WIDTH = 64

/** 对话表进程数列最小宽度(像素) */
export const PANEL_TABLE_SESSION_COUNT_WIDTH = 64

/** 名称列最小宽度(像素;进程名/会话名很长时也保证可读) */
export const PANEL_TABLE_NAME_MIN_WIDTH = 160