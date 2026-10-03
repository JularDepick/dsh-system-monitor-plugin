# AGENTS 开发协作守则

> 本文档为 Agent 开发协作守则与项目信息模板的合订文档,适用于 Agent 与协作的人类开发者,内容按项目状态维护。
> 文档由两部分构成:第一部为开发守则,第二部为项目信息模板。

## 0. 文档说明

- 适用对象:Agent、与 Agent 协作的人类开发者
- 模板版本号:`v0.2.0` (用途详见第一部分第19章)
- 内容构成:
  - 第一部"守则":开发与协作行为规则,共 19 章
  - 第二部"项目信息模板":随项目状态维护的章节模板,含模板使用说明、章节总览与各章节模板

## 目录

- 第一部 守则
  - 1. 守则总纲
  - 2. 语言
  - 3. 授权
  - 4. 会话与任务
  - 5. 工作目录与文件系统
  - 6. 项目结构与技术栈
  - 7. 环境、依赖、构建与运行
  - 8. git 操作
  - 9. 文档维护
  - 10. README 与多语言文档
  - 11. 版本文档
  - 12. 版本号管理
  - 13. 代码开发
  - 14. 更新日志与计划
  - 15. 前端项目规范
  - 16. 子代理
  - 17. 作者信息
  - 18. 术语定义
  - 19. 模板版本与更新流程
- 第二部 项目信息模板
  - 模板使用说明
  - 模板章节总览
  - 各章节模板（概述、技术栈、架构、目录结构、工作流程、开发时配置文件、设计细节、版本号索引、快捷命令、辅助脚本、GitHub Actions 工作流）

---

# 第一部 守则

## 1. 守则总纲

- 不得修改本守则内容,除非用户明确要求维护本守则,并且维护不得丢失本守则的细节
- 当本守则内容与系统级提示词发生冲突时,向用户报告请求决策,不要自主决定
- 本守则所在文档可能存在绑定于具体项目的信息,需要根据项目更新维护这些信息（懒维护）
- 本文档是写给 Agent、与 Agent 协作的人类开发者看的

## 2. 语言

- Agent 的思考过程和结果输出必须全程使用用户所使用的语言,除非系统限制或用户明确指定思考/输出的语言
- 维护任意 md 文档时,自然语言描述部分尽量使用用户所使用的语言,避免非必要的英文表述;例如 `Phrase 1` 是非必要的,而专业术语 `MySQL` 是必要的

## 3. 授权

- 单次授权原则:用户的任何授权仅限单次请求,完成后立即失效,不得跨请求复用,除非用户明确指定某次授权的作用域（起始和结束）

## 4. 会话与任务

- 每当用户追加新任务时,不要阻塞或打断旧任务,确保完成旧任务后再执行新任务
- 向用户确认本项目是否有缩写或简称,方便创建文件出现未明确名称时直接使用命名
- 新会话中,开始操作前,先确认有哪些读写工具可用,并选择合适可用的读写工具,避免因工具问题干扰后续工作
- 每次完成变更后,给用户的反馈不要完全复述更改,而是给出变更大纲和部分重要细节,然后向用户表明上述是大致内容,如果用户需要更详细的反馈信息再说

## 5. 工作目录与文件系统

- 不要主动碰工作目录以外的地方（除非用户明确要求）;如果有这个需求的话,需要询问用户是否能在工作目录下解决,并由用户决策解决方案
- 当需要使用临时目录时,直接在工作目录下创建 `temp/` 或 `.agents/` 文件夹,不要碰工作目录以外的地方
- 相对路径原则:项目各处涉及项目内路径问题优先使用相对路径,避免环境依赖,保证项目迁移部署后仍正常工作

## 6. 项目结构与技术栈

- 工作目录下,如果用户没有特别指定,那么 `src/` 就是功能性的源码目录,其余内容则是辅助性和说明性的内容;另外要明确目录结构,严禁混淆使用
- 必须明确开发技术栈,每当有变更技术栈的需求时需要提醒用户进行确认
- 当目录结构（包括文件）发生改变时,及时更新 `.gitignore` 文件

## 7. 环境、依赖、构建与运行

- 当发现开发环境、依赖、模块等内容缺失时,不要自主下载、修复或操作,而是告知用户缺失了什么、它有什么用、缺失它会产生什么影响、安装它会操作文件系统哪个位置,让用户决策
- 不要主动构建产物、运行测试,除非用户明确要求或授权
- 不要主动清理构建缓存等非代码内容,避免构建进度丢失、重复下载,除非用户明确要求或授权

## 8. git 操作

- git 权限分级:

| 权限级别 | 命令/操作 | 使用条件 |
|:---:|:---:|:---:|
| 读取 | `git log` `git status` `git diff` | 可随时使用 |
| 写入 | `git add` `git commit` `git push` `git reset` `git amend` | 需用户当次对话明确授权（如"提交"、"push"、"合并"） |

- git 提交规范:
  - 暂存更改只允许使用 `git add .` ,所以要先检查维护 git 忽略文件
  - 对于大改动,询问用户是否要 commit 标题包含版本号（如果包含的话,后续是否要迭代版本号以及怎么迭代）,body 记录功能性变化（与上一版本比较）、git表观变化
  - 小改动则使用不含版本号的 commit 标题
- git commit 的内容请保证干净,不要包含 git 操作相关的信息,例如不要在 commit 内容里记录合并过多个 commit 这一操作
- 用户未明确要求时,不要动 tag 和 release,也不要 push
- 不要更改用户的 `LICENSE` `COPYRIGHT` 等项目长久性文件,除非用户明确提出要求变更

## 9. 文档维护

- 任意文档中不要提及时间顺序、工时计算、预估耗时、预期效果,因为开发是 Agent 在做实现而不是人类开发者
- 任意文档中不得使用 emoji 字符
- 维护任意 md 文档时,应该全量或逐段落加载文档内容,避免遗漏导致部分内容过时或有误
- 维护任意 md 文档时,允许改写、转换说法,但是不得丢失细节,除非用户明确提出额外要求
- 维护任意 md 文档时,如果使用到表格,应该默认使用 `|:---:|` 单元格居中
- 文档的版本徽章显示文字中,版本号不带 v 字母前缀
- 遇到文档中有过时内容时,及时清理

## 10. README 与多语言文档

- 项目 README 文档的维护应该以中文版的 `README.md` 或 `README_zh-CN.md` 为核心,最后再翻译成英文版的 `README_en-US.md` 或 `README.md`;主 README 使用何种自然语言由用户决定
- 项目 README 文档内介绍功能特性的位置不要介绍非功能性的细节
- 项目 README 文档可以参考本文档内的非守则内容,但不要照搬,而是针对产品用户、开发者、社区协作者的群体特性选取
- 项目文档多语言版本维护规则:允许同一文档的不同语言版本之间通过链接相互跳转,跨文档链接要保证语言一致性（如果需要）;例如 `README_zh-CN.md` 内允许通过链接跳转到不同语言版本的 README,但是只链接到中文版的 HELP 文档（如果有）

## 11. 版本文档

- `v版本号-*.md` 属于版本文档,星号部分表示具体功用性名称;本条规则占用 git 忽略规则 `v*-*.md`,后续规则冲突时需要提醒用户该规则已被占用;注意本条所提版本号在具体文件实例上要变更为用户指定的具体值,如 `v1.0.0-*.md` 是针对 1.0.0 版本的版本文档
- 版本文档严格绑定于某个历史版本时期,新版本的变更不要覆盖记录到旧版本文档中,而是在旧版本文档中标注该版本文档在最新版本（明确版本号）中已经发生变更;例如旧版本中的某个 UI 设计细节在最新版本中发生了变更,此时不要破坏旧版本文档,而是在最新版本文档中记录这一变更、在旧版本文档中标注这一变更,即新旧版本文档的内容互指
- `docs/` 目录下预设以下版本文档,属于模板文档,默认不主动创建,当用户明确要求时才创建;当用户的需求符合某个版本文档功能性质时可以向用户提出启用建议;当项目正在开发的版本号远高于某个文档绑定的版本号时,不再维护该文档（如果用户要求维护之,则建议用户复制部分内容进新版本的同功能文档,保留旧版文档）:

| 版本文档 | 面向对象 | 主要说明 |
|:---:|:---:|:---:|
| `v版本号-发行说明.md` | 使用项目产物的用户 | 文档结构仅按需包含"新增、修复、优化、兼容性"几个标题,表述适当、合理、简洁、完整,不得复杂化。此类文档只描述目标版本相对于上一版本的用户可见变化量:不描述上一版本不存在的实现过程（如新增功能的内部细节修正）,不表述更新过程中的反复变化（变化路径）。当从未创建过类似文档而用户要求创建时,需要用户指定本次要求时的上一版本号。判断上一版本功能存在与否以 git 历史（上一版本提交）为准,不依据文档 |
| `v版本号-*机制(与规范)?.md` | 项目开发者 | 保证开发者能快速查阅和对照,用于描述某个版本加入的功能的机制与规范、进行功能上抽象级别的**总结**;允许包含示例代码、设计细节,但是不得包含具体的实现代码和语法、变量名称等代码细节 |
| `v版本号-可改进清单.md` | 项目开发者 | 保证开发者能快速查阅和对照,用于记录该版本时用户未实现的想法、Agent 推荐的改进;该文档只做简单的记录,不制定方案或计划 |
| `v版本号-前驱版本待办排期清单.md` | 项目开发者 | 保证开发者能快速查阅和对照,用于排期目标版本及其前驱版本的待办项。待办项按预期版本号升序排列（同一版本内按添加先后顺序）。每项必须包含以下字段:变更级别（主版本级=不兼容旧版/次版本级=破坏性变更/修订版本级=无破坏变更）、预期版本号（已确定实现版本时填写具体版本号;未确定具体实现版本但明确早于目标版本时以"早于v\<目标版本\>（匿名）"标注;预期版本不得晚于目标版本）、添加版本（该待办最初被记录时项目正在进行的版本号）、来源文档（该待办迁移自的文档路径;原创待办填写本清单自身和添加版本）、内容（待办的具体描述,含变更级别判定依据或前置审计结论时一并写入）、依赖关系（与其他待办的配套/前置关系,如依赖某待办则须同版本实施,无依赖填无）、当前状态（基于项目正在开发的版本号实时更新的状态"未实施/实施中/已实施"）。迁移自其他文档的待办保留其添加版本标注,实施完成时更新当前状态 |

## 12. 版本号管理

- 版本号使用标准的 `<主版本号>.<次版本号>.<修订版本号>` 格式,例如 `0.1.0` ,一般习惯性地携带前缀字母v,例如 `v0.1.0`
- 当不确定版本号时,应该从 git log 查看后向用户确认正在开发的项目的版本号,不允许自动迭代版本号
- 只有在用户明确重新指定新版本号后才能弃用旧版本号,新版本号要及时同步到项目源码和文档各处
- 当项目最新状态不兼容旧版本（有冲突）时,仅提醒用户注意迭代版本号,但不做版本号迭代兜底
- 版本号迭代后,及时更新项目文档中的全量内容到最新状态
- 推荐用户在根目录下创建 `version.index.md` ,自动维护该文档记录版本号在项目中出现的位置,具体到文件路径和行数位置,方便版本号更迭时快速查看版本号位置

## 13. 代码开发

- 合理组织代码保证代码结构化,避免结构混乱不利于后续开发
- 充分发挥面向对象思维,开发过程中及时封装对象
- 在模块内具有复用价值的对象和功能要提取成模板转移进独立代码文件,方便后续开发复用引入
- 代码中可个性化修改但不影响项目核心功能的设计细节（指后文定义的设计细节）,需要以全局常量/宏/独立代码文件之一的形式隔离储存,便于开发者知悉和维护
- 当项目多次尝试修复同一个问题未成功解决时,完整阅读所有代码后再动手
- 代码内禁止使用 emoji,并避免代码内的无用连续空白符
- 代码注释根据语言全部使用跨行注释,精简注释内容,减少无效注释字符

## 14. 更新日志与计划

- 用户没有明确要求时,不要撰写任何更新日志、CHANGELOG,不要储存项目状态,避免过期内容污染项目
- 当用户要求要写更新日志时,每次 git commit 操作后,必须在 `CHANGELOG.md` 末尾追加本次 commit 变更的简要说明（用 commit 编号做一级标题,commit 内容首行做二级标题,标题后的段落适当补充标题未说清的内容）
  - 注意 `CHANGELOG.md` 文件不记录对 git 未追踪文件的变更,也不记录自己的变更;其内容可以比 commit 内容更详细;如果内容缺失,则从最新一个 commit 的后续才开始记录
  - 注意 `CHANGELOG.md` 文件默认被 git 追踪,且 git 记录中不描述该文件的变更
  - 需要在 `CHANGELOG.md` 页脚（使用引用块）明确该文件记录落后于 git 记录一个 commit（追加变更日志时不可能提前知晓未提交的 commit 的 hash 编号）
- 当 Agent 工作必须需要写计划、日志、报告等文档时,优先使用 `temp/` 或 `.agents/` 文件夹,避免使用 `docs/` 文件夹、避免污染项目本体

## 15. 前端项目规范

- 前端网页项目不要使用浏览器原生弹窗提醒,而是使用自定义飘窗提醒
- 前端网页项目不要使用浏览器原生弹窗进行二次确认,而是在原按钮上执行"替换为确认按钮-3s 内点击确认-超时回归初始状态"流程
- 前端网页项目默认隐藏浏览器侧边滚动条（如果有）,然后告知用户（允许用户回退该操作）
- 前端网页项目的表格、select 控件默认文本水平居中
- 日期格式化:默认使用 `yyyy-MM-dd HH:mm:ss+HH:mm` 格式,除非用户明确指定使用别的格式

## 16. 子代理

- 合理利用子代理（如果有）并行任务,以加快项目进程或避免已有上下文污染思考;注意设定子代理个数上限（默认 5）避免并发超限
- 处理好子代理的上下文继承关系,已过期用不上的子代理及时关闭或销毁,避免占用资源

## 17. 作者信息

- 项目作者已确认: 是
- 项目作者:[JularDepick](https://github.com/JularDepick)
- 前后端项目请在后端代码注释头、每一个前端页面底部标注作者信息,并在控制前端页面的代码里定义宏或常量,方便开发者动态替换前端页面作者信息
- 提醒用户是否要修改本段落的项目作者信息,得到答复后标记“项目作者已确认”为“是”

## 18. 术语定义

| 术语 | 定义 |
|:---:|:---:|
| 用户 | 与 Agent 进行对话交互的人类主体（在上下文中具有用户标识） |
| 开发者 | 有能力对本项目源码作出修改和优化的人类主体 |
| 产品用户 | 使用和体验本项目产物的人类主体（一般不参与开发） |

## 19. 模板版本与更新流程

- 本文档当前使用的模板版本号为 `v0.2.0`
- 当用户明确要求更新本 `AGENTS.md` 文档的模板版本时,执行以下流程:
  1. 使用 curl 工具访问 `https://api.github.com/repos/JularDepick/AGENTS.md-Best-Practices/tags`,解析返回的 JSON 文本中的第一个 `name` 字段（值即模板最新版本号）
  2. 如果该字段的版本号大于本文档当前使用的模板版本号（已在本文档中定义）,则继续下一步;否则携带版本号告知用户已是最新版本,并结束本流程
  3. 使用工具下载 `https://raw.githubusercontent.com/JularDepick/AGENTS.md-Best-Practices/<version>/src/develop/general-methodology/JularDepick/AGENTS.md`（注意替换 `<version>` 为模板最新版本号）,保存为新模板版本文档 `temp/AGENTS-<version>.md`（可以同样地下载本文档当前使用的模板版本原始文件到本地,方便做差异对比）
  4. 合并新模板文件到本项目根目录的 `AGENTS.md` 文档（可使用 diff 工具）;冲突部分向用户询问要求决策,并给出推荐取舍方案,用户指定后再解决合并冲突
  5. 完成后,清理 `temp/AGENTS-<version>.md`
- 当GitHub源遇到网络问题或用户要求使用国内源时,请使用中国大陆地区备用镜像源(每日UTC时间自动从GitHub同步): 
  - 查看最新版本号: `curl --request GET --url "https://api.cnb.cool/JularDepick/AGENTS.md-Best-Practices/-/git/tags" --header "Accept: application/vnd.cnb.api+json" --header "Authorization: 1f1a38Oekwl6tNP6mFxkdNak5eS"`
  - 下载指定版本号的模板原始文件: `curl --request GET --url "https://api.cnb.cool/JularDepick/AGENTS.md-Best-Practices/-/git/raw/<version>/src/develop/general-methodology/JularDepick/AGENTS.md" --header "Authorization: 1f1a38Oekwl6tNP6mFxkdNak5eS"` （注意替换 `<version>` 为模板最新版本号）

---

# 第二部 项目信息模板

> 以下章节为项目信息模板,内容按项目最新状态维护。

## 模板使用说明

- 模板章节分为默认启用与默认未启用两类;默认未启用的扩展项,在用户明确要求或审计确认确有需要时启用,启用后及时填充内容
- 模板中段落的行内代码块内容可能包含路径匹配、参数匹配、变量匹配、正则匹配的混合语法,需要区分理解;例如 `~/` 表示工作目录,`<...>` 表示参数或变量,`(...)?` 表示内容正则匹配存在或不存在

## 模板章节总览

| 章节 | 默认状态 | 用途 | 维护时机 |
|:---:|:---:|:---:|:---:|
| 概述 | 启用 | 项目概述信息 | 项目最新状态变化时自主更新 |
| 技术栈 | 启用 | 记录项目技术栈 | 技术栈发生变化时自主更新并告知用户 |
| 架构 | 启用 | 记录前后端架构、服务架构 | 架构发生变化时自主更新并告知用户 |
| 目录结构 | 启用 | 记录工作目录树形图结构 | 目录结构发生变化时自主更新并告知用户 |
| 工作流程 | 默认未启用扩展项 | 记录项目产物运行时的工作流程 | 按需启用,有需要或用户指定时补充次要流程或分支 |
| 开发时配置文件 | 启用 | 记录影响项目核心功能的配置文件列表 | 配置发生变动时维护 |
| 设计细节 | 启用 | 记录可个性化修改但不影响核心功能的设计细节 | 设计细节发生变动时维护 |
| 版本号索引 | 启用 | 记录当前版本号 | 版本号迭代后更新 |
| 快捷命令 | 启用 | 记录 Agent 开发时使用的命令 | 按项目实际需求选择性补充 |
| 辅助脚本 | 默认未启用扩展项 | 记录工作目录 `scripts?/` 内的辅助脚本 | 按需启用、按需撰写 |
| GitHub Actions 工作流 | 默认未启用扩展项 | 记录 `.github/workflows/` 内的规范化工作流配置 | 用户明确指出有对应需求时才启用 |

## 各章节模板

### 概述

dsh-system-monitor-plugin:监控 dsh 进程及其派生子进程的资源占用。插件自主采集 dsh 进程树的 CPU 占用率与内存占用(按量级自适应 KB/MB/GB、百分比),并汇总整机口径的「其他应用」(与 dsh 无关的系统进程)与「空闲」占用;Agent 通过汇报工具主动上报插件无法自主识别的进程句柄(subagent 等);监控数据仅在插件 UI 面板展示,不暴露给 dsh 使用。

- 插件命名遵循 `dsh-<核心名称>-plugin` 规范,核心名称 `system-monitor`;
- 项目文档语言核心为中文:主 README 为 `README.md`(中文),英文为额外文档 `README_en-US.md`;
- 目标 dsh 版本 `0.2.0-rc.2`,Release 命名绑定该版本(见 `docs/repo-spec/tag-release-spec.md`)。

### 技术栈

| 项目 | 选型 |
|:---:|:---:|
| 语言 | TypeScript,ESM(`type: module`) |
| 构建 | tsdown(构建产物输出 `dist/`;pack tarball 归位 `release/`,build 前置清空 release 旧包) |
| 包管理 | pnpm |
| 目标 dsh 版本 | 0.2.0-rc.2 |
| 运行时依赖 | `@deepseek-ai/schemastery` 3.18.4(`dependencies`,无状态工具包);`@deepseek-ai/cordis` 4.0.4 与 `@deepseek-ai/dsh-tools` 0.2.0-rc.2(`peerDependencies` + `devDependencies`,与宿主共享实例,运行时由宿主/profile 提供)。dsh 前缀的 peer 自 dsh 0.2.0-rc.2 起被宿主强制校验,须与目标 dsh 版本严格对应 |
| 客户端 UI | React 18(运行时由宿主平台模块表提供),`conversation.view` 槽 + host webserver 数据路由;官方组件库 `@deepseek-ai/dsh-client-ui-primitives`(devDependency,平台 seed 直接 value-import) |

> 当项目技术栈发生变化时需要自主更新并告知用户

### 架构

插件为单包 bundle,以 Cordis 插件运行于 dsh 运行时,模块组成:

| 模块 | 职责 |
|:---:|:---:|
| 采集器(collector) | 按轮询间隔采集 dsh 进程树与已汇报句柄的资源占用 |
| 汇报工具(reporter) | 向 tools 服务注册句柄汇报工具,接收 Agent 上报的外部进程句柄 |
| 面板数据(panel) | 经 host webserver 注册数据端点,CPU 占用率与内存占用只经此出口 |
| 客户端面板(client) | 浏览器端注册会话区域「系统监控」标签页,同源轮询面板数据 |
| 翻译(translation) | INI 翻译加载与语言切换,未命中回退默认语言 |

数据边界:监控数据不得经工具输出、服务接口、事件通道暴露给 dsh 主体或模型,仅 UI 面板展示。

> 主要指前后端架构、服务架构。当项目架构发生变化时需要自主更新并告知用户

### 目录结构

```
dsh-system-monitor-plugin/
├── src/                        # 功能源码
│   ├── index.ts                # 插件入口(name/inject/apply)
│   ├── config.ts               # Config 接口与 Schemastery schema
│   ├── constants.ts            # 全局常量与设计细节
│   ├── monitor/                # 系统监控模块
│   │   ├── index.ts            # 模块装配
│   │   ├── types.ts            # 进程句柄、资源样本、快照与回执类型
│   │   ├── collector.ts        # 进程资源采集器(平台查询链:Windows CIM/降级、Linux /proc、macOS ps/降级;CPU 差分)
│   │   ├── reporter.ts         # 进程句柄汇报工具
│   │   └── panel.ts            # 面板数据提供(host webserver 数据端点)
│   ├── client/                 # 客户端插件
│   │   ├── index.tsx           # conversation.view 槽注册与面板组件
│   │   └── i18n.ts             # 客户端文案字典与语言解析
│   └── translation/            # 翻译预设与加载器
│       ├── index.ts            # 翻译加载器(按 locale 加载、回退)
│       ├── .example_zh-CN.ini  # 翻译基准模板
│       ├── zh-CN.ini           # 简体中文
│       └── en-US.ini           # 英文
├── docs/
│   ├── dsh-dev-docs/dsh-0.2.0-rc.2/   # dsh 官方插件开发文档(速查见 index.agent.md)
│   ├── repo-spec/tag-release-spec.md  # Tag 与 Release 规范
│   ├── tech-spec/translation-ini.md   # 翻译文件规范
│   ├── dsh-web-tab-experience.md      # dsh web tab 开发经验与客户端面契约
│   └── v*-*.md                        # 版本文档(发行说明、机制与规范、待办排期清单;git 忽略)
├── scripts/                    # 构建辅助脚本
│   ├── clean-release.cjs       # build 前置:清空 release/ 旧包
│   ├── pack-to-release.cjs     # postpack:tarball 归位 release/
│   └── syntax-check.mjs        # 语法验证(仅解析不构建,覆盖 src/scripts/.agents)
├── .agents/                    # 会话交接与冒烟脚本(git 忽略,不随包发布)
├── AGENTS.md                  # 开发协作守则与项目信息
├── version.index.md           # 版本号索引
├── README.md                  # 中文主 README
├── README_en-US.md            # 英文 README
├── package.json               # bundle manifest 与构建脚本
├── cordis.patch.yml           # 配置层 patch
├── tsconfig.json              # 类型检查配置
├── tsdown.config.ts           # 构建配置
├── pnpm-workspace.yaml        # pnpm workspace 声明
└── .gitignore
```

根目录其余文件为辅助性与说明性内容;临时文件放 `temp/` 或 `.agents/`。

> 指工作目录的树形图结构文本,默认采用 `src/` 源码结构,具体结构以本段落具体值和项目状态优先。当目录结构发生变化时需要自主更新并告知用户

### 工作流程（默认未启用扩展项）

运行时主流程:插件加载并向 tools 注册汇报工具 → 启动采集轮询(dsh 进程树)→ Agent 会话中调用汇报工具上报外部进程句柄 → 采集集合取并集 → UI 面板周期性展示资源占用。

数据只进面板,不流向 dsh 主体。

> 指项目产物运行时的工作流程,一般只需要给出主要流程及其分支,如果有需要或用户指定时则可以补充次要流程或分支

### 开发时配置文件

影响项目核心功能的配置文件:

| 文件 | 功能说明 |
|:---:|:---:|
| `package.json` | bundle manifest(`dsh.bundle` 指向 patch、`dsh.client` 客户端面)、ESM 声明、`main`/`types` 指向 dist 产物、构建脚本(`prepare` 自动构建)、发布字段(license/repository/engines) |
| `cordis.patch.yml` | 配置层 patch,按包名插入插件行 |
| `tsconfig.json` | TypeScript 类型检查配置 |
| `tsdown.config.ts` | 构建配置,产物输出 `dist/`(`index.mjs`、`index.d.mts` 与 `client.js`) |
| `pnpm-workspace.yaml` | 声明当前目录为 pnpm workspace,并在工作区内固定内容寻址 store(`storeDir`,相对路径);隔离用户家目录的全局 workspace 与 store |
| `.gitignore` | 忽略 node_modules、缓存、产物、版本文档等 |

> 主要指源码目录中影响项目核心功能的配置文件,例如 `package.json` `config.ini`（如果有）;此处只需要给出具体文件列表和功能性说明即可,无需给出文件具体内容

### 设计细节

- 插件包名:`dsh-system-monitor-plugin`;插件注册名(name)同包名
- 默认语言与回退语言:`zh-CN`;翻译文件目录:`src/translation`,命名与内容遵循 `docs/tech-spec/translation-ini.md`,新增语言以 `.example_zh-CN.ini` 为基准模板
- 资源采集轮询间隔默认值:1000 毫秒(同时写入配置 schema 默认)
- 汇报工具名称:`system_monitor_report`;入参进程句柄结构遵循 `docs/v0.1.0-进程汇报机制与规范.md`
- 系统进程查询超时:10000 毫秒;Linux 时钟节拍:100(`LINUX_CLK_TCK`)
- 操作系统识别:快照平台字段为运行平台显示名,Linux 经 `/etc/os-release` 识别发行版与版本(如 Ubuntu 24.04.4 LTS),不做宿主机穿透识别
- 面板形态:会话区域标签栏「系统监控」tab(客户端半身,`conversation.view` 槽,id `system-monitor`,排序 30,标签文案跟随界面语言);数据经 host webserver 端点 `/api/system-monitor/snapshot` 同源轮询(1000 毫秒);UI 对齐 dsh web 原版风格:内容宽度取 tab 区域可用宽度并按 `PANEL_MAX_WIDTH` 收窄(不再对齐宿主对话列宽,避免宽 tab 区域两侧大片空白),颜色只用 `--dsw-alias-*` 语义 token 与 `--dsw-static-*` 静态色 token,排版取宿主字号 token(`PANEL_TYPOGRAPHY`,基准 s-14 14px/22px,随宿主「内容字号」设置);组成:统计卡 KPI、官方 `StateDot` 状态徽章(正常/降级/数据源不可用)、**三个区域卡**(按序:本会话维度「本会话进程资源」——只统计归属为当前 tab 会话的进程、进程维度「进程资源」、对话维度「对话资源」,每张卡=头部标题与计数及该维度 CPU/内存合计、三段泳道图例、CPU/内存两条占比条、该维度明细表,名称前配色块作图例、表格动态列宽、超长名省略号)、系统信息行(含其他应用进程数)、高占用警示(阈值 90)、骨架屏与空/错误态;三张区域卡头部整行为**折叠开关**(标题即入口,宿主 chevron 图标 + `aria-expanded`,默认展开;折叠隐藏整卡内容——图例、两条占比条与明细表,只留头部);内存按量级自适应 KB/MB/GB,百分比一律精确到 0.01%;页脚项目与作者超链接随常量可替换;**泳道内名称**(各段内部居中显示进程名/对话名,两端显示泳道名「其他」「空闲」;名称直接压在分段底色上、不加底色块,文字色**优先白色、次选黑色**(白色相对分段底色的对比度不低于 `PANEL_SHARE_NAME_MIN_CONTRAST` 即用白字,浅色底才退回黑字;名称**无内外边距、行高压到 1**(不把说明字号的行高带进泳道,单元格同样归零),静态色 token 明暗同值,故按常量中的回退十六进制值判定,右端空闲泳道是别名底色、用主题三级文字色);放不下则留空并只保留悬停提示)由面板右上角「配置」按钮呼出的**面板内配置子页**控制(子页替换三个区域卡,ESC 或「关闭」按钮收起),子页内提供「泳道内名称」与「视图列数」(单列 / 双列)两组设置;**子页控件一律用宿主官方组件**(`Switch`、`SegmentedControl`、`Button`),配色与外观继承 profile web、不自绘,设置行收在 `PANEL_SETTINGS_WIDTH` 内以免宽卡片下标签与控件相距过远;设置写入浏览器端本地偏好(`PANEL_STORAGE_KEY`),本地未改过时沿用插件配置 `laneNames` 与 `columns`(宿主设置页按插件 Config schema 自动生成的页面仍为 Profile 级默认值),面板经数据端点每次响应下发的 `panelOptions` 读取这两项;列数为双列时栅格锁为两列(单列时为一列纵向排布,列数由用户显式选择、不再随宽度自适应)
- 资源占比条形状(两卡一致,三段固定泳道):左端 `PANEL_SHARE_OTHERS_RATIO`(20%)为「其他应用」(与 dsh 无关的系统进程合计),中段 `PANEL_SHARE_DSH_RATIO`(60%)为「dsh 及其子进程」并按成员显示权重分段,右端 `PANEL_SHARE_IDLE_RATIO`(20%)为「空闲」(整机未被占用);**中段分段规则(CPU 与内存两行口径一致)**:判定与分配都按该维度全部成员进行——只有一个成员时允许它独占中段;成员多于一个时每个成员先取保底宽度 `PANEL_SHARE_MEMBER_MIN_RATIO`(0.04,成员很多时自动收窄为「非最大者份额 ÷ 成员数」),最大成员封顶到 `PANEL_SHARE_MAX_SINGLE_RATIO`(1/3),其余宽度由其余成员按各自占整机数值的比例分取(其余成员数值合计为 0 时等分),故中段任何情况下都被铺满、零占用成员也有可见占位(并列最大时只封顶排序在前的那个);三段宽度都是固定 UI 长度、不随真实占用变化,占用数值全部相对整机、精确到 0.01%,由各段正下方的标签给出(内存行给「具体数值(按量级自适应 KB/MB/GB) · 整机百分比」,CPU 行给整机百分比;内存行每段备「数值 · 百分比 → 仅数值 → 仅百分比」多级候选、取第一个放得下的,悬停 `title` 恒给最全的一条;两端泳道同样给数值——左端取载荷中的其他应用内存合计,右端空闲数值由「整机内存总量 − 其他应用 − 已监控成员」推出、下限截零、与百分比口径同源;有值成员放不下才留空);零占用成员同样给出标签(CPU 为整机口径、1 秒窗口内常为 0.00%,按零值隐藏会让整行空白),是否显示一律只看放得下;判据为按字宽估算(中日韩字符按整宽 `PANEL_TEXT_CJK_WIDTH`、其余按 `PANEL_SHARE_LABEL_CHAR_WIDTH`)+ `PANEL_SHARE_LABEL_PADDING`,取该段保底与封顶后的实际宽度),段悬停 `title` 给完整信息;左端用 `PANEL_OTHERS_COLOR` 静态中性色,中段非主泳道成员用 `PANEL_SERIES_COLORS` 系列色(琥珀/绿/红/中性,**不含蓝色家族**),主进程(进程维度 pid 等于 rootPid)与宿主(对话维度 HOST 组)泳道固定用 `PANEL_PRIMARY_COLOR`(继承 profile web 品牌蓝)且不参与系列色轮转(`ShareGroup.primary` 标记 + `groupColors()` 统一分配,表格色块与占比条同源),右端用 `PANEL_IDLE_COLOR`(淡灰,不用纯白)且整条带 1px 外边框(`PANEL_SHARE_BAR_BORDER_WIDTH`/`PANEL_SHARE_BAR_BORDER_COLOR` 取 profile web 描边色,配 `boxSizing:border-box`);**条高恒定**:`PANEL_SHARE_BAR_HEIGHT` 与 `PANEL_SHARE_BAR_HEIGHT_NAMED` 取值相同,名称开关不改变泳道高度;条宽按卡片实测宽度推导(测量不可用时回退 `PANEL_SHARE_BAR_FALLBACK_WIDTH`);整机口径数值(其他应用、空闲)由采集器汇总,「空闲」为整机未被任何应用进程占用的百分比(下限截零),口径与绝对量见 `docs/v0.1.0-进程汇报机制与规范.md`
- 对话维度归属:样本带可选 `owner`(会话标识/显示名/是否子会话),来源优先级为终端服务(PTY 快照 pid ↔ 会话)> Agent 汇报句柄的显式 `sessionId` > 子进程环境(`DSH_SESSION_ID`,Linux/WSL 经 `/proc/<pid>/environ`,按 pid 缓存并按当前 pid 集合裁剪);宿主进程自身归入「dsh 宿主」组、无归属进程归入「未归因」组;**宿主组固定在最前(即中段泳道最左端)、未归因组置于最后**,中间是各会话(顺序即中段分段与表格行序,两处同源避免错位);会话显示名取宿主会话标题(缺失时退化为 cwd 目录名/会话标识),子会话加「子会话」标注;Windows 无跨进程环境读取,退化为「宿主 + 未归因 + 显式汇报」
- 本会话维度:样本的 `owner.sessionId` 与会话座位注入的 `sessionId`(宿主 `ui-session` 合并进会话标准 props;本地未装其类型包,故按最小类型面取 `unknown` 后判字符串)相等者即为「本会话进程」,按进程维度同样规则分组与配色,置于最前;标识缺失或无匹配进程时该卡显示空态
- 面板文案本地化:字典以 `PANEL_LOCALE_NAMESPACE` 命名空间注册进宿主 locale 服务(`ctx.locale.register`),`conversation.view` 注册声明同一命名空间以取得框架注入的 `t` 座位,标签 thunk 与面板文案因此跟随 dsh 界面语言(禁用浏览器 `navigator.language` 判定;宿主语言 id 为 `zh`/`en`,字典键集与 `src/translation/*.ini` 双向一致)
- 面板数据有效性:采集器尚未产出首份快照时,数据端点先等待首轮采集计算完成(`PANEL_FIRST_SAMPLE_WAIT_MS`,为查询超时加 2 秒),超时才返回 200 + 占位快照(`sampledAt` 为 0、`error` 记失败原因),浏览器端因此不会先拿到会令面板置空的占位数据;客户端按串行轮询(等本轮请求结束再排下一轮)且只在 `sampledAt` 大于 0 时更新界面——占位响应不覆盖既有内容,不带 `error` 的占位只表示首轮未完成(保持加载态),带 `error` 的占位与请求失败才置「数据源不可用」(已有旧快照时保留旧快照并改示徽章)
- 面板容器契约(0.2.0-rc.2 发布包核对,与 0.1.7-rc.2、0.1.5-rc.1 一致):宿主视图区与滚动容器均无内边距、槽锚点为 `display:contents`,故面板自带内边距(`PANEL_TOP_PADDING`/`PANEL_BOTTOM_PADDING`/`PANEL_COLUMN_GUTTER`,`max-width` 取 `PANEL_MAX_WIDTH` 以用满 tab 可用宽度、仅超宽屏收窄);三张区域卡放在栅格容器(`.sm-cards`)中,列数由用户选择(`columns` 配置:单列 = `1fr` 纵向排布,双列 = `repeat(2, minmax(0, 1fr))` 强制两列),默认单列;面板根为纵向 flex 滚动容器(`flex:0 1 auto; min-height:0; overflow-y:auto`),并在注入样式中用 `.sm-column > * { flex: none; }` 锁死直接子块不参与压缩(卡片带 `overflow:hidden` 时 flex 自动最小尺寸为 0,会被压扁并裁掉内容);占比条由三段固定泳道构成(两端按 `PANEL_SHARE_OTHERS_RATIO`/`PANEL_SHARE_IDLE_RATIO` 固定宽度,中段按 `PANEL_SHARE_DSH_RATIO` 固定宽度并在其内用 `flexGrow` 分配各成员比例),标签行与泳道同构(固定比例与 `flexGrow` 一致)以免逐行漂移;两张维度表均用**动态列宽**策略(`table-layout:fixed` + `colgroup`):每列先按内容挤满(内容宽度取该列表头文案与最长单元格的较大者,低于列宽下限时取下限;进程表 名称/`PANEL_TABLE_PID_WIDTH`/`PANEL_TABLE_PARENT_WIDTH`/`PANEL_TABLE_SESSION_WIDTH`(会话名称列,无归属显示 `--`)/`PANEL_TABLE_CPU_WIDTH`,对话表 名称/`PANEL_TABLE_SESSION_COUNT_WIDTH`/`PANEL_TABLE_CPU_WIDTH`,两张表的内存列都拆为「具体数值 + 占比」两列并共用「内存」表头(`colSpan=2`,下限 `PANEL_TABLE_MEMORY_VALUE_WIDTH`/`PANEL_TABLE_MEMORY_PERCENT_WIDTH`);名称列下限 `PANEL_TABLE_NAME_MIN_WIDTH`),再把表格富余宽度按各列内容宽度比例分给所有列(富余不再被名称列独吞,避免宽卡片下出现超大列宽),内容挤不下时各列等比压缩,名称列以省略号截断(超长名称不挤压其它列、不撑高行);审计与实测记录见 `temp/ui-audit/`
- 宿主版本兼容性(dsh 0.2.0-rc.2 起强制):宿主只读插件 `peerDependencies` 中 `@deepseek-ai/dsh` 或 `@deepseek-ai/dsh-*` 前缀的项,按 `semver.satisfies(运行时版本, 范围, {includePrerelease:true})` 判定;不兼容时 `dsh plugin add` 抛 `incompatible-version`(退出码 1),profile 装载前该行被置 `disabled` 并打印禁用原因。`@deepseek-ai/cordis` 与 `@deepseek-ai/schemastery` 不参与判定。豁免走 profile 目录的 `compatibility.json`(`dsh plugin allow-version`,授予需 `--accept-risk`)。本项目因此把 `@deepseek-ai/dsh-tools` 的 peer 精确绑定目标 dsh 版本,`engines.dsh` 仅为声明性元数据(已决策不声明)
- 编译产物:`dist/index.mjs` 与 `dist/index.d.mts`(服务端)、`dist/client.js`(客户端,固定名);pack tarball 归位 `release/`(build 前置清空 release 旧包,postpack 归位新包);`package.json` 的 `main`/`types` 与真实产物对齐
- 版本控制与分发边界:`dist/` 与 `release/` 均为构建生成物,不入版本控制;对外分发走 GitHub Release 附 tarball(包内已含 `dist/`)。后果:固定提交中不含运行产物,DSH STORE 一类的固定源自动检查会判为"运行产物缺失"并因此无法自动收录,属有意取舍,不以追踪构建产物换取收录
- 许可证口径:项目以 Apache-2.0 授权,`LICENSE`(Apache License 2.0 全文)为唯一权威文本;`package.json` 的 `license` 字段与两个 README 的许可证徽章必须与之一致(不得再出现 MIT 等其它许可声明);历史发行物(如 `v0.1.0` Release 附件)不回溯修改
- 依赖分区:`@deepseek-ai/cordis` 与 `@deepseek-ai/dsh-tools` 同时声明在 `peerDependencies` 与 `devDependencies`(与宿主共享实例,运行时由宿主/profile 提供;devDependency 副本供类型检查与独立测试);`@deepseek-ai/schemastery` 作为无状态工具包留在 `dependencies`;客户端面依赖包(ui-conversation/ui-primitives/ui-renderer/ui-slots)以 `devDependencies` 引入
- 客户端面声明:`package.json` 的 `dsh.client` 为 `{ platform: 'web', inject: ['@deepseek-ai/dsh-client-ui-renderer', '@deepseek-ai/dsh-client-ui-conversation'] }`;`inject` 填真实包名(供客户端组合排序,非 Cordis 服务注入),客户端服务的注入由 `src/client/index.tsx` 导出的 `inject` 承担
- 文档语言核心:中文(`README.md` 为中文主 README,英文为额外文档)
- 翻译/加载行为:未命中回退默认语言,文件缺失回退空表由主逻辑兜底
- 维护规则:按需核对 `docs/dsh-dev-docs/<版本>/` 与官方仓库 `docs/user/develop` 是否过时,过时则按官方收录流程更新到新版本目录
- 全局常量索引(文件路径与名称):`src/constants.ts` — `PLUGIN_NAME`、`DEFAULT_LANGUAGE`、`FALLBACK_LANGUAGE`、`TRANSLATION_DIR`、`DEFAULT_POLL_INTERVAL`、`DEFAULT_LANE_NAMES`、`DEFAULT_PANEL_COLUMNS`、`REPORT_TOOL_NAME`、`QUERY_TIMEOUT_MS`、`LINUX_CLK_TCK`、`MONITOR_DATA_PATH`、`CLIENT_POLL_INTERVAL`、`PANEL_FIRST_SAMPLE_WAIT_MS`、`PANEL_STORAGE_KEY`、`PANEL_TAB_ID`、`PANEL_TAB_ORDER`、`PANEL_LOCALE_NAMESPACE`、`PANEL_AUTHOR`、`PANEL_AUTHOR_URL`、`PANEL_PROJECT_URL`、`PANEL_HIGH_LOAD_THRESHOLD`、`PANEL_COLUMN_GUTTER`、`PANEL_MAX_WIDTH`、`PANEL_TOP_PADDING`、`PANEL_BOTTOM_PADDING`、`PANEL_STACK_GAP`、`PANEL_TYPOGRAPHY`、`PANEL_SERIES_COLORS`、`PANEL_PRIMARY_COLOR`、`PANEL_SHARE_TRACK_COLOR`、`PANEL_IDLE_COLOR`、`PANEL_SHARE_BAR_BORDER_WIDTH`、`PANEL_SHARE_BAR_BORDER_COLOR`、`PANEL_SHARE_BAR_HEIGHT`、`PANEL_SHARE_BAR_HEIGHT_NAMED`、`PANEL_SHARE_NAME_PADDING`、`PANEL_SHARE_NAME_MIN_CONTRAST`、`PANEL_SETTINGS_WIDTH`、`PANEL_SHARE_OTHERS_RATIO`、`PANEL_SHARE_DSH_RATIO`、`PANEL_SHARE_MAX_SINGLE_RATIO`、`PANEL_SHARE_MEMBER_MIN_RATIO`、`PANEL_SHARE_IDLE_RATIO`、`PANEL_OTHERS_COLOR`、`PANEL_SHARE_LABEL_CHAR_WIDTH`、`PANEL_SHARE_LABEL_PADDING`、`PANEL_SHARE_BAR_FALLBACK_WIDTH`、`PANEL_CHART_LABEL_WIDTH`、`PANEL_SWATCH_SIZE`、`PANEL_CELL_PADDING_X`、`PANEL_TEXT_CJK_WIDTH`、`PANEL_TABLE_NAME_MIN_WIDTH`、`PANEL_TABLE_PID_WIDTH`、`PANEL_TABLE_PARENT_WIDTH`、`PANEL_TABLE_SESSION_WIDTH`、`PANEL_TABLE_CPU_WIDTH`、`PANEL_TABLE_MEMORY_VALUE_WIDTH`、`PANEL_TABLE_MEMORY_PERCENT_WIDTH`、`PANEL_TABLE_SESSION_COUNT_WIDTH`

> 主要指可个性化修改但不影响项目核心功能的设计细节,某个项第一次使用时一般需要取默认值方便开发者知悉和维护,具体包括但不限于:
>
> - 项目产物文件名 `<main_name>(.<type>)?` ,默认取 `<项目名称>(.<type>)?`
> - 项目产物运行时:
>   - 占用的文件系统文件夹:
>     - 用户目录 `~/<main_name>/` ,默认取 `~/<项目名称>/`
>     - 工作目录 `<workspace>/<main_name>/` ,默认取 `<workspace>/<项目名称>/`
>   - 监听的地址和端口 `<address>:<port>` ,默认取 `localhost:8080`
>
> 当项目设计细节具有全局常量/宏/独立代码文件的定义形式时,需要在本段落具体内容末尾添加索引性说明（文件路径,行数,宏/量名称）。
> 特别地,当项目状态中的设计细节具体值与本段落设计细节值发生冲突时,需要向用户报告请求决策,不要自行决定

### 版本号索引

- 当前版本:v0.1.2

- `version.index.md` 定位与维护方式:记录项目当前版本号,并列出版本号迭代需同步更新的文件清单(文件路径与行号);读取时先查看 git 历史、配置文件、关键文档,向用户汇报确认真实版本号,需要时更新;版本号迭代时按清单同步更新所列文件中的版本号,允许继续新增清单项;版本号格式遵循 `docs/repo-spec/tag-release-spec.md`

> 版本号中 x 表示十进制数,不限制位数,无前导 0

### 快捷命令

> 主要指 Agent 开发时使用的命令,如安装依赖、热重载、构建产物、清理残留;需要按照项目实际需求选择性补充,注意适配开发环境的命令行类型

```
pnpm install                          # 安装依赖
pnpm typecheck                        # tsc --noEmit 类型检查
pnpm build                            # tsdown 构建产物到 dist/(前置清空 release/ 旧包)
node scripts/syntax-check.mjs         # 语法验证(仅解析不构建,不读 tsconfig、不解析依赖)
node .agents/smoke-0.2.0-rc2.mjs      # 构建产物冒烟断言(.agents/ 不随包发布)
pnpm pack                             # 打包 npm tarball(prepare 自动先构建,postpack 归位 release/)
npm publish --dry-run                 # npmjs 发布预演校验
dsh plugin --profile <name> add <包或 tarball>   # 安装到 dsh profile
```

依赖缓存与内容寻址 store 固定在工作区内(`storeDir` 见 `pnpm-workspace.yaml`,相对路径),沙箱环境避免写工作区外被拒。pnpm 的 `minimumReleaseAge` 供应链策略会拦截刚发布的 rc 包,单次安装可加 `--config.minimumReleaseAge=0` 覆盖。

### 项目启动

后续新会话接手本项目时按以下流程启动:

1. 完整阅读根目录 `AGENTS.md`:守则区为硬约束;项目绑定区随项目状态懒维护;
2. 读 `version.index.md` 与 git log,确认当前真实版本号,向用户汇报确认;版本格式遵循 `docs/repo-spec/tag-release-spec.md`;
3. 读核心 README(`README.md`,中文)与项目技术文档(`docs/tech-spec/`、`docs/` 下版本文档),掌握既定机制设计;
4. 读已收录的 dsh 插件开发文档(`docs/dsh-dev-docs/<版本>/`):先读 `index.agent.md` 速查表,涉及框架机制时精读基础篇与框架篇;未收录时回官方仓库 `docs/user/develop` 查阅;
5. 动手前的关键技术决策先列给用户裁决;涉及安装/构建/测试须经授权。

### 会话交接要点

- 完整会话交接提示见 `.agents/NEXT_SESSION.md`(项目现状、客户端面契约踩坑、部署与验证方法、待办、技能;随工作区维护,不随包发布);本段仅保留最常查要点:
- WSL 部署测试经验见 `.agents/wsl-deploy-testing.md`(部署步骤、服务端/浏览器端验证清单、常见问题排查、0.2.0-rc.2 待复验点;实机测试由人工完成,复验结论回写该文件与 NEXT_SESSION.md);
- 客户端面契约:包 `exports` 必须含 `"./package.json"`;client bundle 的 `module`/`exports` 定义须并入 banner(tsdown 0.22 无 intro);
- WSL 发布版部署:客户端面托管以 `NODE_PATH=<profile>/node_modules` 启动 `dsh web`(0.1.5-rc.1 实测该方案托管正常,不带 NODE_PATH 未复核;0.1.7-rc.2 与 0.2.0-rc.2 按发布包静态核对机制未变,待实机复验);0.2.0-rc.2 客户端托管 URL 仍为批量格式 `/plugins/??<包名>/client.js&rev=...`(旧单包路径 404)、首页需启动 URL 的 `?token=` 认证(401/303 下发 cookie,重启换令牌);开发迭代用直接部署工作流(复制 `dist/`、`package.json`、`cordis.patch.yml` 覆盖 profile 包目录);tarball 分发取 `release/`;
- 未完成事项:`v0.1.2`(适配 dsh 0.2.0-rc.2)的依赖安装仍受 pnpm 12.6.0 机器级 store 操作锁的沙箱限制阻塞(`pnpm install`/`pnpm run <script>` 均会先触发依赖校验安装),已按绕过路径完成验证:直接跑 `node node_modules/typescript/bin/tsc --noEmit` 类型检查、`node scripts/clean-release.cjs` + `node node_modules/tsdown/dist/run.mjs` 构建、`node .agents/smoke-0.2.0-rc2.mjs` 冒烟全通过;`pnpm pack` 与实机复验仍未执行(`release/` 当前为空,旧 v0.1.1 包已备份到 `temp/release-backup/`);macOS 采集已实现(`ps -axo pid=,ppid=,time=,rss=,comm=`,失败降级为 `ps -axo pid=,rss=,comm=` 即无父子关系且 CPU 时间置零,窗口文案随之标降级);Linux(含 WSL)采集已实现。

### 开发经验

- 插件本质:导出 `name`、`inject`、`apply(ctx, config)` 的 TypeScript 模块;必需依赖用 `inject` 声明,框架保证依赖就绪后才执行 `apply`;
- 配置:导出同名 `Config` 类型 + Schemastery `Schema`(默认值写入 schema),无效配置在加载期响亮失败;凡不同部署取值可能不同的参数都必须定义为配置字段(无硬编码可调参数);
- 工具:经 `ctx.tools.register(defineTool({ name, description, parameters, output, execute }))`;需要 `inject: ['tools']`;
- 生命周期:经 `ctx` 的注册卸载时自动清理;手动资源用 `ctx.effect(() => cleanup)`,有顺序依赖的清理放进同一处置器串行;
- 服务与事件:服务是挂在 `ctx` 上的命名能力,提供服务用 `extends Service` + 声明合并;事件四种模式(emit/bail/serial/waterfall,waterfall 必须调用 `next()`);Harness 的 `turn/*`、`step/*`、`tool/call` 等是持久化会话事件类型,观察它们要监听 `session/event` 并检查 `event.type`;
- bundle 打包:包清单声明 `dsh.bundle` 与 patch 层;patch 以插件包名插入插件行,加载顺序按 profile bundles 列表,后应用的层按行胜出(整行替换,不深度合并);git 安装只拉源码需要自包含 `prepare` 脚本 + 用户 `allowBuilds` 授权,否则分发 npm 包或 tarball(`pnpm pack`);
- 目录组织:入口、配置 schema、全局常量独立成文件,机制按模块分目录,模块内拆分类型定义与实现;占位方法以抛错或空值标明"尚未实现";
- 版本对齐:先查本地已装 dsh 各包版本,与 npm registry 比对,对齐到本地运行版本(带 rc 的包核对 registry 的 next 标签);
- 沙箱环境:npm/pnpm 写缓存到工作区外会被拒,store/cache/state 重定向到工作区内;tsdown 产物为 `.mjs/.d.mts`,`package.json` 的 `main`/`types` 必须与真实产物对齐;Node 动态 import 绝对路径必须转 `file://`;**pnpm 12.6.0 起 `pnpm install` 会先在机器级路径 `%LOCALAPPDATA%\pnpm-store-operation-locks\all-stores.lock` 开跨 store 操作锁,该路径在工作区外,workspace-write 沙箱下报 `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`(`拒绝访问 os error 5`)并在改动任何文件前中止;`storeDir`/`PNPM_HOME`/`XDG_*` 指向工作区均无法改道,也无关闭开关,只能放宽该次命令的沙箱权限或把 pnpm 降回 12.4.2**;
- junction 解析(Node 26/Windows):Node 26 的 JS 版 `fs.realpathSync` 不再解析 Windows junction(仅 `realpathSync.native` 解析),而 pnpm 隔离布局在 Windows 上用 junction 链接顶层包,嵌套依赖的解析基点因此停在 junction 路径上,本地 `node` 直接运行构建产物或构建工具时报 `ERR_MODULE_NOT_FOUND`(实测 `@deepseek-ai/schemastery`/`@deepseek-ai/cordis` → `@deepseek-ai/cosmokit`、`tsdown` → `ansis`);`pnpm-workspace.yaml` 设 `publicHoistPattern: ['*']` 把依赖公开提升到根 node_modules 规避,仅影响本地开发环境布局,不随包发布;
- 冒烟测试:临时脚本放 `.agents/`,对构建产物断言入口导出、配置默认值、假 ctx 验证装配与工具注册、工具边界校验与去重回执、采集器纯逻辑、翻译 INI 与客户端字典双向一致、client bundle 包装头与外部化清单、依赖分区与 `dsh.client` 声明;`pnpm pack` 后列 tarball 内容核对打包边界(`files` 收窄,避免源码混入)与包内产物逐字节一致;
- 客户端发包契约:`exports` 必须含 `"./package.json"`(宿主 client-modules 用 `require.resolve('<包名>/package.json')` 定位,缺此导出会被 exports 拦截拒绝);
- client bundle 包装:tsdown 0.22 无 `intro` 选项(静默忽略),`module`/`exports` 定义必须并入 `banner`(否则浏览器端执行时 `exports is not defined` 导致插件加载失败);
- 客户端 UI 组件:官方平台 seed 包 `@deepseek-ai/dsh-client-ui-primitives`(StateDot/Pill/Button 等)可直接 value-import(构建时外部化,运行时由宿主提供),其类型以 devDependency 引入;需要与宿主对话列对齐时可用宿主 `--dsh-chat-content-width` 等变量,**本面板不采用该做法**(改为用满 tab 可用宽度并按 `PANEL_MAX_WIDTH` 收窄,否则宽 tab 区域两侧会留大片空白);`--dsw-alias-*` 为官方语义 token 体系;
- 客户端文案本地化:第三方客户端插件的文案不能按 `navigator.language` 判定,那样只跟浏览器语言走、与 dsh 界面语言不一致;正确做法是把字典以命名空间注册进宿主 locale 服务(`ctx.locale.register(ns, { zh, en })`,语言 id 仅 `zh`/`en`),并在槽注册时声明 `locale: ns`,框架据此把 `t` 座位注入组件 props、并在语言切换时重建座位(`label` 用 `ctx.locale.bind(ns)` 的 thunk 即可随语言变化);声明了 `locale` 命名空间却不注册字典会让槽装配在渲染期响亮失败;`ctx.locale` 的类型家 `@deepseek-ai/dsh-client-locale` 只承载类型用途,未引入为 devDependency 时可按最小类型面取值(运行时服务由宿主提供);
- 客户端数据有效性:面板数据端点在没有真实数据时也可能返回 200(占位结构),客户端必须按"字段是否有效"判定而非只看 HTTP 状态,否则会把占位值(如时间戳 0、全 0 指标)当真实数据渲染;
- WSL/发布版部署:客户端面发现机制优先走 Loader 自身解析(`locatePkgJson` 经 loader `internal.resolveSync` 后取最近祖先 manifest),无 Node 内部时才回退 `createRequire().resolve('<包名>/package.json')`(0.1.5-rc.1、0.1.7-rc.2 与 0.2.0-rc.2 发布包核对同构);0.1.5-rc.1 实测(`NODE_PATH=<profile>/node_modules` 启动)客户端面托管正常(BOOT 注入条目、批量 URL 200),不带 NODE_PATH 未复核,0.1.7-rc.2 与 0.2.0-rc.2 待实机复验;0.2.0-rc.2 托管 URL 仍为批量格式 `/plugins/??<包名>/client.js&rev=...`、首页需启动 URL 的 `?token=` 认证(401/303 下发 cookie,重启换令牌),插件自定义数据路由(如 `/api/system-monitor/snapshot`)无需认证;服务端不受影响;
- 宿主版本兼容性(dsh 0.2.0-rc.2 起强制):跨 dsh 大版本升级时,dsh 前缀 `peerDependencies` 必须一并升级到目标版本,否则插件在目标版本上会被安装侧拒绝、启动侧禁用(机制细节见 `docs/dsh-dev-docs/dsh-0.2.0-rc.2/index.agent.md` 的「插件版本兼容性策略」);`@deepseek-ai/cordis`、`@deepseek-ai/schemastery` 等非 dsh 前缀 peer 不参与该判定,但仍需按运行时实际版本自行对齐;
- 直接部署工作流:构建后把 `dist/`(构建产物)、`package.json`、`cordis.patch.yml` 直接复制进 profile 的 `node_modules/<包名>/` 覆盖,重启 dsh web 即可生效(client.js 变化走 rev 刷新),免去 pack/add 往返;tarball 分发统一取 `release/`(`pnpm pack` 归位);
- 部署测试规则:部署只负责把最新构建的插件包安装进 WSL dsh profile(直接复制或 `dsh plugin add`),**不自动启动 3081 服务**,启动由用户手动执行(`NODE_PATH=<profile>/node_modules dsh web --no-open --port 3081`);
- Windows 沙箱:PowerShell 每次调用独立无状态,必要时传 `workdir`;控制台中文乱码不代表文件损坏(UTF-8 正常)。

### 辅助脚本（默认未启用扩展项）

> 主要指放在工作目录 `scripts?/` 文件夹内的脚本文件,是由 Agent 撰写并维护的,需要按需撰写;辅助脚本的存在主要是为了补充 Agent 技能/工具能力的不足、减轻批量工作时的上下文负担、供给 GitHub 工作流自动化调用。主要功能包括但不限于:
>
> - 测试与罗列可用的开发环境
> - 执行快捷命令的组合和扩展
> - 执行文件内容的检索与替换
> - 获取与解析网络页面的内容
> - 复制核心产物到发布包目录
>
> 辅助脚本的具体实现形式需要根据开发环境决定:简单任务一般用 bat/cmd/bash 脚本即可解决,复杂任务应该使用 Python 脚本解决（此时如果缺失 Python 环境则提醒用户建议安装）。
> 当文件夹名称冲突时选择备选辅助脚本文件夹名称（其一):`assist-scripts?/` `assist/`

### GitHub Actions 工作流（默认未启用扩展项）

> 指工作目录下与 `.git/` 文件夹同时存在的 `.github/workflows/` 目录,用于储存 GitHub 远程仓库的规范化工作流配置文件。当用户明确指出项目有如下需求（或部分需求）时才允许启用（默认不启用):
>
> - 自动化构建并发布发行版（Releases）:在代码合并或打标签时,自动构建产物并创建/更新 Release,同时上传构建产物
> - 自动化触发部署（Deployments）:在特定条件（如推送到 `main` 分支）下,自动触发部署任务至指定环境（测试,预发布,生产）,并回传部署状态
> - 自动化打包与托管软件包（Packages）:构建成功后,自动将项目打包为符合规范的格式（如 npm、Docker 镜像等）,并推送至 GitHub Packages 进行版本管理
> - 自动化执行辅助脚本:在构建或部署前后,自动执行脚本以动态调整目录结构,复制和移动文件,确保后续步骤运行环境正确
> - 自动化运行测试（单元/集成测试）:在代码推送或合并请求时,自动执行单元测试、集成测试,并生成测试报告;若测试失败则阻断后续构建和发布流程
> - 自动化代码质量检查（Lint 与安全扫描）:在构建前自动运行代码风格检查、静态分析以及依赖安全漏洞扫描,确保代码符合规范且无已知高危漏洞
> - 自动化生成变更日志与更新文档:在 Release 发布时,自动根据 Conventional Commits 规范生成 `CHANGELOG.md`,并自动构建和部署项目文档（如 GitHub Pages）至指定分支
> - 自动化清理过期资源:定期或每次发布后,自动删除不再使用的旧 Release 预发布版本、过期的包（Packages）版本或临时构建缓存,以节省存储空间
>
> 除通用辅助脚本外,由 GitHub Actions 工作流调用的脚本应该放在 `.github/scripts?/` 下,避免与项目的（辅助）脚本文件夹混淆