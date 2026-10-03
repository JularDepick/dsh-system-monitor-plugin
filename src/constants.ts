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

/**
 * CPU 展示口径:
 * `machine` 为整机口径(占全部逻辑处理器的百分比,单进程上限 100%),
 * `core` 为单核口径(占单个逻辑处理器的百分比,多线程进程可超过 100%);
 * 仅影响面板展示,采集与差分口径始终按整机计算。
 */
export type CpuScope = 'machine' | 'core'

/** CPU 展示口径默认值(整机口径,与采集口径一致) */
export const DEFAULT_CPU_SCOPE: CpuScope = 'machine'

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
 * 让旧缓存自动失效并重新探测(避免把历史错误值一直沿用下去);
 * 第 3 版起把单次诊断字段改为探测历史数组。
 */
export const CLK_TCK_CACHE_VERSION = 3

/** 状态文件中保留的探测历史条数上限(旧值在前,超出按先入先出丢弃) */
export const CLK_TCK_PROBE_HISTORY_MAX = 10

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

/** 面板内配置子页的 DOM 标识(入口按钮经 aria-controls 指向它,展开时焦点移入该区域) */
export const PANEL_SETTINGS_REGION_ID = 'sm-settings'

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

/**
 * 双列视图的最小栅格宽度(像素):用户选择双列但可用宽度低于此值时自动回退单列,
 * 避免窄屏下每张卡被压到无法阅读;取值约等于两列各自可用的最小宽度加一处列间距。
 */
export const PANEL_CARDS_DOUBLE_MIN_WIDTH = 720

/**
 * 明细表可隐藏的可选列(名称列与 CPU 列恒显示:它们是识别行与判读占用的最小信息面)。
 * 取值同时用作本地偏好里的列标识,新增可选列时在此追加。
 */
export const PANEL_TABLE_OPTIONAL_COLUMNS = ['pid', 'parent', 'session', 'memoryPercent'] as const

/** 可隐藏列标识 */
export type PanelTableColumn = (typeof PANEL_TABLE_OPTIONAL_COLUMNS)[number]

/**
 * 列表行留存的默认轮数:某身份连续这么多轮没被采样到即从面板移除该行
 * (期间该行保留显示但数值归零);配置面范围 `MIN_RETAIN_ROUNDS` 至 `MAX_RETAIN_ROUNDS`。
 */
export const DEFAULT_RETAIN_ROUNDS = 10

/** 行留存轮数下限(配置面校验;低于它会让瞬时抖动也触发移除) */
export const MIN_RETAIN_ROUNDS = 5

/** 行留存轮数上限(配置面校验;高于它会让早已退出的进程长期留在面板) */
export const MAX_RETAIN_ROUNDS = 60

/**
 * 百分比展示下限(单位:百分比):低于该值且不为零的读数显示为 `<0.01%`,
 * 确切为零的读数显示为 `0%`(真零是已知值,不能与「小于精度」混为一谈);
 * 恰为下限时按原值显示。
 */
export const PERCENT_DISPLAY_FLOOR = 0.01

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

/*
 * 面板配色(统一继承当前 profile 的主题 token;明暗两套由宿主给出,面板不自绘颜色)
 *
 * 每项注释给出宿主主题的真实解析取值(浅色 / 深色),取自官方客户端产物内嵌的主题样式,
 * 便于核对「继承自 profile」而不是凭印象选色;回退值只在宿主 token 缺失时兜底。
 * 组织原则:
 *   面 —— 由浅到深形成台阶:页底 → 卡片 → 标题行 → 占比条轨道(明暗两套各自成台阶);
 *   字 —— 四档层级与宿主标签层级一一对应(主 / 次 / 三级 / 说明);
 *   线 —— 两档:常规描边(卡片外框与行分隔)与强化描边(表头下边框与占比条外框);
 *   彩 —— 强调色取宿主的信息 / 业务主色;分段色取宿主静态色序列;状态色取宿主状态档位。
 */


/** 卡片面(统计卡与四张维度卡共用:浅色主题为浅灰面,深色主题为抬升面) */
export const PANEL_CARD_COLOR = 'var(--dsw-alias-bg-module-platform, #f5f6f7)'

/**
 * 维度卡标题行底色(比卡片面深一档,用于区分标题与正文):
 * 取滚动条底色二级档,浅色主题 #e5e5e5、深色主题 #545557 —— 深色主题下必须用这一档,
 * 一级档(#3c3c3d)与卡片面(#353638)几乎同色,标题行会读不出分界。
 */
export const PANEL_CARD_HEAD_COLOR = 'var(--dsw-alias-scrollbar-bg-l2, #e5e5e5)'

/** 占比条轨道底色(比标题行再深一档;三段泳道铺满,故只在圆角与边框内侧可见) */
export const PANEL_SHARE_TRACK_COLOR = 'var(--dsw-alias-scrollbar-hover-l2, #d4d4d4)'

/** 常规描边(卡片外框、行分隔):一级描边过淡(浅色主题仅 4% 黑,肉眼近乎不可见),故统一用二级 */
export const PANEL_BORDER_COLOR = 'var(--dsw-alias-border-l2, #0000001a)'

/** 强化描边(表头下边框、占比条外框) */
export const PANEL_BORDER_STRONG_COLOR = 'var(--dsw-alias-border-l3, #0000001f)'

/** 文字:主档(标题、KPI、数值) */
export const PANEL_TEXT_PRIMARY_COLOR = 'var(--dsw-alias-label-primary, #0f1115)'

/** 文字:次档(卡片标题、系统信息标签) */
export const PANEL_TEXT_SECONDARY_COLOR = 'var(--dsw-alias-label-secondary, #61666b)'

/** 文字:三级档(辅助说明、未采样行、装饰性提示、页脚) */
export const PANEL_TEXT_TERTIARY_COLOR = 'var(--dsw-alias-label-tertiary, #81858c)'

/**
 * 强调色(主进程 / 宿主泳道、短期趋势线、单点圆点):
 * 取宿主的信息 / 业务主色(浅 #4176e6,深 #7aaaff),随 profile 与明暗主题变化。
 * 不用 `--dsw-alias-brand-primary`:该 token 在本设计系统里是黑白(浅 #0f1115 / 深 #f9fafb),
 * 用作泳道与折线会与正文同色、读不出「主泳道」。
 */
export const PANEL_ACCENT_COLOR = 'var(--dsw-alias-state-business-primary, var(--dsw-alias-link, #4176e6))'

/** 交互态叠加底色:悬停(半透明,压在各自底色上,故明暗两套都成立) */
export const PANEL_HOVER_COLOR = 'var(--dsw-alias-interactive-bg-hover, #2631480f)'

/** 交互态叠加底色:按下与背景标注(趋势线上的工具调用区间) */
export const PANEL_ACTIVE_COLOR = 'var(--dsw-alias-interactive-bg-active, #2631481a)'

/** 状态:正常(状态徽章、无高占用) */
export const PANEL_STATE_OK_COLOR = 'var(--dsw-alias-state-success-primary, #22c55e)'

/** 状态:警示文字(降级 / 数据源不可用徽章与提示文案) */
export const PANEL_STATE_WARN_COLOR = 'var(--dsw-alias-state-warn-label, #dd8629)'

/** 状态:警示底色(数据源不可用提示卡的底色) */
export const PANEL_STATE_WARN_SURFACE_COLOR = 'var(--dsw-alias-state-warn-tertiary, #fef5e7)'

/** 状态:错误(高占用数值高亮) */
export const PANEL_STATE_ERROR_COLOR = 'var(--dsw-alias-state-error-primary, #ec1313)'

/** 左端「其他应用」泳道底色(宿主静态中性色,明暗同值) */
export const PANEL_OTHERS_COLOR = 'var(--dsw-static-neutral-400, #a2a4a6)'

/** 右端「空闲」泳道底色(浅灰,与卡片面可辨) */
export const PANEL_IDLE_COLOR = 'var(--dsw-alias-scrollbar-bg-l1, #e5e5e5)'

/**
 * 中段「无成员」占位底色(灰暗):
 * 取遮罩档位,浅色主题为 24% 黑、深色主题为 50% 黑,故两套主题下都比空闲段更暗,
 * 让「该维度暂无成员」一眼可辨(该占位同时带兜底悬停提示)。
 */
export const PANEL_SHARE_EMPTY_COLOR = 'var(--dsw-alias-bg-mask-1, #0000003d)'

/** 占比条整体外边框颜色(与表头下边框同档:2px 灰色,明暗两套都清晰) */
export const PANEL_SHARE_BAR_BORDER_COLOR = PANEL_BORDER_STRONG_COLOR

/**
 * 资源占比堆叠条的分段配色(非主泳道成员按顺序循环取用)。
 * 全部取自宿主静态色 token(明暗同值,故段内文字色的对比判定可按回退值进行);
 * 不含蓝色家族 —— 强调蓝固定留给主进程 / 宿主泳道(`PANEL_ACCENT_COLOR`),避免与成员分段混淆。
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

/** 占比条整体外边框宽度(像素):2px,明暗主题下都清晰可辨 */
export const PANEL_SHARE_BAR_BORDER_WIDTH = 2

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
 * 因此低占用时中段仍能清楚比较各进程/会话;中段按 dsh 成员相对占比分段。
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

/** 会话表进程数列最小宽度(像素) */
export const PANEL_TABLE_SESSION_COUNT_WIDTH = 64

/** 名称列最小宽度(像素;进程名/会话名很长时也保证可读) */
export const PANEL_TABLE_NAME_MIN_WIDTH = 160

/**
 * 操作列(末尾的移除按钮列)固定宽度(像素):
 * 该列**不参与**列宽的自动分配(既不按内容宽度挤满,也不分富余宽度),
 * 故取「按钮 16px + 两侧单元格内边距 12px」再留 2px 余量,恒定 30px。
 */
export const PANEL_TABLE_ACTION_WIDTH = 30
