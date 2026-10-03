# 给 dsh Web 界面新增 tab 页/UI(外部插件通用经验)

> 面向 dsh 插件开发者:总结外部插件为 dsh Web GUI 贡献 UI(尤其是新增 tab 页)的完整机制与落地要点
> 以会话区域「对话/轨迹」视图标签栏新增 tab 为实例,同样适用于「设置-插件」页等其他挂载点
> 机制基于官方仓库源码(见文末索引)与 0.1.1-rc.2 发布包核对,已按 0.1.5-rc.1,0.1.7-rc.2 与 0.2.0-rc.2 发布包复核更新(平台模块表,槽 owner props,槽锚点与视图容器样式,客户端发现机制);本经验为静态总结,换版本时以对应发布包类型声明为准

## 一,总体流程(五个步骤)

1. **package.json 声明 client 面**:声明 `dsh.client`(`platform: 'web'`,`inject` 仅信息性)与 `exports["./client"]`(指向 client 构建产物)
2. **构建 client 产物**:tsdown 输出固定名的客户端脚本(位于构建产物目录),格式为 `window.__ModuleLoader__.load({ id, factory })` 的 CJS 包装
3. **写浏览器端代码**:`src/client/` 下 `apply(ctx)` 用 `ctx.slots.inject(...)` + `ctx.slots.register(...)` 注册组件
4. **host 自动发现与 serve**:无需修改 patch/loader 行——host 的 ClientModuleRegistry 按 loader 条目(entry name = 包名)扫描 `package.json`,serve `/plugins/<包名>/client.js`,并把条目注入 `window.__DSH_BOOT__`
5. **(可选)数据通道**:浏览器端需要 host 数据时,用 host 的 webserver 服务注册自定义路由,浏览器同源 fetch

## 二,会话区域 tab 挂载点(conversation.view)

### 槽契约

| 项 | 值 |
|:---:|:---:|
| 槽名 | `conversation.view`(官方声明于 `@deepseek-ai/dsh-client-ui-conversation/client`) |
| kind / scope | list / session |
| 注册 options | `id`,`order`,`label`(可为 `() => string` 跟随语言),`locale` 字典命名空间(可选) |
| owner props | `inspectCall` / `viewRequest` / `openView` / `completeViewRequest`(0.1.5-rc.1,0.1.7-rc.2 与 0.2.0-rc.2 的视图聚焦与检查器交接,可选,不消费即可;0.1.1-rc.2 为 `inspect` / `onInspectDone`) |
| 组件 props | `PropsRuntime<'conversation.view'>`(含会话座位 sessionId/useSession/useSessions,**不强制使用**) |

### 注册代码(官方 ui-trajectory 同模式)

```ts
ctx.slots.inject('conversation.view', () => ctx.slots.register({
  name: 'conversation.view',
  id: 'my-tab',
  order: 20,
  label: () => 'My Tab',
}, MyTabComponent))
```

- 必须用 `ctx.slots.inject` 等待声明(槽由 ui-conversation 声明,外部包可能先于它激活);注册进未声明槽是加载期响亮失败
- 类型:组件文件 type-only import `@deepseek-ai/dsh-client-ui-conversation/client` 使 SlotMap 合并生效;`inject: ['slots', 'locale']` 即可(只有需要读会话数据时才额外注入会话服务)
- 官方范例文件:`packages/client/ui-trajectory/src/client/index.ts`

### 会话区域 tab 的行为特性(重要)

1. **tab 栏在 `tabs.length > 1` 时才显示**:web profile 默认已有「对话」(chat)与「轨迹」(trajectory),新增第三个必然显示 tab 栏
2. **scope session 只是座位,不是数据约束**:组件可以完全不消费 sessionId/useSession,直接 fetch host 的全局接口做**全局统计**(如跨会话聚合数据)
3. **tab 栏随会话页出现**:无会话时(hero 页)会话区域不存在,tab 不可见;这是该槽的固有属性
4. **组件崩溃有 per-entry 错误边界**:只黑掉自身 tab,不影响会话页其他区域

### 备选挂载点

「设置-插件」页的 `settings.plugins.tab`(list/root,options id/order/label),类型声明在 `@deepseek-ai/dsh-client-ui-settings/client`;与 conversation.view 的注册代码完全同构,只换槽名;官方范例:`packages/client/ui-settings-plugins/src/client/index.ts`

## 三,关键机制细节

### 1. client 产物格式(必须逐项对齐)

官方预设见 `packages/client/tsdown.client.ts` 的 `clientConfig`:

| 项 | 值 |
|:---:|:---:|
| format / platform | cjs / browser |
| entryFileNames | `client.js`(固定名,host 按此路径 serve) |
| external | 宿主冻结模块表 `PLATFORM_MODULES`(见下)为基线,`dsh.client.external` 只补充基线之外的精确请求(tsdown 用 `deps.neverBundle` 表达);纯类型 import 被擦除,不产生请求;组合阶段会拒绝畸形请求,缺失提供方,自请求与同步请求环(0.2.0-rc.2 发布包语义) |
| noExternal | 其余全部内联(`deps.alwaysBundle`:未被请求的 specifier 一律打进 bundle;官方另有 INLINE_SAFE wire 层内联约定) |
| banner / footer | `window.__ModuleLoader__.load({ id: "<包名>", factory: (require) => {` / `return module.exports; } });`(tsdown 会格式化多行,断言勿用单行匹配) |
| intro | 官方预设写 `var module = { exports: {} }; var exports = module.exports;`;tsdown 0.22 无 `intro` 选项(静默忽略),必须并入 banner(本项目做法) |
| dts | false(类型由 tsc 走 lib/types,别让 dts 包装 banner) |
| define | `process.env.NODE_ENV` 与 `import.meta.env.MODE`(zustand 等内联库需要) |
| CSS Modules | 自定义插件:lightningcss 编译 `.module.css` 为 hashed classMap + 注入 `<style data-plugin>`(tsdown 自带 css 管线不处理,需虚拟 id 包装,后缀不能是 `.css`) |

平台模块表(宿主冻结模块表中的 seed 词,0.2.0-rc.2 取发布包 `@deepseek-ai/dsh-web-frontend` 前端产物中的 `PLATFORM_MODULES` 表,与 0.1.7-rc.2,0.1.5-rc.1 逐项一致):

```
react, react/jsx-runtime, react-dom, react-dom/client, @deepseek-ai/cordis,
@deepseek-ai/dsh-client-store, @deepseek-ai/dsh-client-ui-slots,
@deepseek-ai/dsh-client-ui-primitives, @deepseek-ai/dsh-client-ui-dockkit
```

> 0.2.0-rc.2 相比 0.1.7-rc.2 该表未变(0.1.7-rc.2 相比 0.1.5-rc.1 亦未变;0.1.5-rc.1 相比 0.1.1-rc.2 的变更为:`@deepseek-ai/dsh-client-store`,`@deepseek-ai/dsh-client-ui-dockkit` 新增;`@deepseek-ai/dsh-client-web-react`,`@deepseek-ai/dsh-client-ui-attachment`,`@deepseek-ai/dsh-client-schema-form` 移除);外部插件的 tsdown 外部化清单必须与该表逐项一致,多余外部化会在浏览器端解析失败;`@deepseek-ai/dsh-client-ui-primitives` 在表中,可继续 value-import(如 `StateDot`)

### 2. 跨插件协作纪律(构建期 purity 门强制)

- 浏览器 bundle 只能 value-import 平台模块表内的包;其他 `@deepseek-ai/*` 一律 **type-only import**(声明合并,类型),运行时经 cordis 服务(`ctx.slots` / `ctx.locale` / `ctx.settingsScope` / `ctx.remote` / `ctx.connection`)协作
- type-only import 在打包时擦除,不会触发构建期 purity 检查
- 官方构建链有 `dsh-client-bundle-purity` 插件把违规 value import 变成构建错误,建议保留

### 3. slot 系统(注册 = 声明 + 授权)

- 组件 props 是四 shares 交集:`PropsRuntime<K>`(SlotMap owner + 框架座位)+ `PropsRenderSlots<S>`(children 渲染权)+ `PropsStore<H>`(store 座位)+ 注册时 `inject` 返回的业务面;声明 `locale` 时另有 `t` 座位
- 无 children 的组件直接 `PropsRuntime<'槽名'>` 即可(注册点类型会自动校验)
- `ctx.slots.inject('槽名', factory)` 等待他人声明的槽;factory 返回 register 的 disposer(可 yield 多个)

### 4. 数据通道选型(浏览器端展示 host 数据)

| 方案 | 结论 |
|:---:|:---:|
| 转发事件(remote $on) | 白名单在官方 api/remotes 静态声明,外部插件**不可扩充** |
| Typert remote(host-plugin-inventory 模式) | 最正规但需整套 typert 生成链,单包插件过重 |
| host webserver 路由 | 最轻:host 侧 `ctx.get('webServer', false)` 可选获取 + `register({ kind: 'exact', path, handler })`,浏览器同源 fetch;服务晚出现时用 `ctx.on('internal/service')` 补挂 |

### 5. 槽锚点与视图容器契约(0.1.5-rc.1 实测,0.1.7-rc.2 与 0.2.0-rc.2 发布包复核一致)

| 项 | 结论 |
|:---:|:---|
| 槽锚点 | ui-renderer 为每个 outlet 生成包裹 div,样式 `display: contents`,不参与布局;注入组件即宿主容器的直接子元素 |
| 会话视图区 | `.viewArea` 为纵向 flex(`flex: 1; min-height: 0; display: flex`)且无内边距;`composer-overlay` 模式下滚动容器 `overflow: hidden auto`,视图区 `flex: 1 1 0; min-height: 0` |
| 注入面板应对 | 自带内边距(宿主不提供);根用纵向 flex 滚动容器(`flex: 0 1 auto; min-height: 0; overflow-y: auto`)承担滚动;直接子块用 `flex: none` 锁死不参与压缩(卡片带 `overflow: hidden` 时其 flex 自动最小尺寸按规范为 0,不锁死会被压扁并裁掉内容) |
| 内容列宽 | `max-width` 用 `calc(var(--dsh-chat-content-width, 748px) + 两侧 gutter)`;`--dsh-chat-content-width` 由宿主在 0.2.0-rc.2 仍定义,窗口更窄时由 gutter 兜底留白 |

## 四,踩过的坑

1. **不需要新增 patch 行**:client 发现机制按 loader 条目(现有插件行)扫描,插件行同时是 host 插件与 client 条目;不要写成 `xxx/client` 子路径行
2. **client.js 缺失 = web profile 启动失败**:激活期扫描发现 `exports["./client"]` 指向的文件不存在会聚合抛错;必须构建产出后再启动
3. **官方仓库快照与发布包版本可能不同**:源码快照版本往往低于发布包(如快照 rc.5 vs 发布 0.1.1-rc.2);核对发布包类型与快照源码在所用 API 上的一致性或差异,换版本时务必以发布包类型为准;0.1.5-rc.1,0.1.7-rc.2 与 0.2.0-rc.2 一致的实测要点:`ctx.slots` 的 Context 类型合并由 `@deepseek-ai/dsh-client-ui-renderer/client` 提供(与槽位 SlotMap 合并的 `ui-conversation/client` 分开),客户端代码需同时 type-only import 两者;`dsh.client.inject` 填真实包名(官方 ui-trajectory/ui-jobs 同模式),它只参与客户端组合排序,不是 Cordis 服务注入
4. **CSS Modules 需要 lightningcss**:tsdown 不内置该管线,官方用自定义插件(虚拟 id + lightningcss transform);不想要 CSS 文件时可用内联样式规避
5. **样式纪律**:使用 `--dsw-alias-*` 语义 token,不写死颜色;产品文案用界面语言;表格/select 文本居中;不用浏览器原生弹窗
6. **pnpm 无 TTY 会 abort**:package.json 描述符变更后需 `CI=true pnpm install`;typecheck/build 也建议 `CI=true` 前缀
7. **文案跟随界面语言必须走宿主 locale 服务**:按 `navigator.language` 判定只跟浏览器语言走,与 dsh 界面语言不一致(用户在设置页切换语言时插件文案不跟着变);正确做法:字典以命名空间注册(`ctx.locale.register(ns, { zh, en })`,内置语言 id 只有 `zh`/`en`),并在槽注册时声明 `locale: ns`,框架据此向组件注入译文函数,语言切换时重建该座位;`label` 用 `ctx.locale.bind(ns)` 的 thunk 即可跟随语言;声明了 `locale` 却不注册字典会在渲染期响亮失败;`ctx.locale` 的类型家在 `@deepseek-ai/dsh-client-locale`(只承载类型,不必作为运行时依赖)
8. **注册的 inline 行高必须带单位**:React 内联样式的 `lineHeight` 属无单位属性,数值会被原样输出为"倍数 × font-size"(`lineHeight: 20` 在 13px 字号下是 260px),组件会因此被撑出大片空白;写 `'20px'` 这类带单位字符串;复刻渲染台验证时也要保持同一数值语义,否则渲染台"通过"而真实页面崩坏
9. **数据端点返回 200 不等于有数据**:自定义数据路由在"暂无数据"时若返回 200 + 占位结构,客户端必须按字段是否有效判定(如采样时刻为 0),否则会把占位值当真实数据渲染

## 五,参考文件索引(官方仓库)

> 路径指向所示时期的仓库快照(本经验已按 dsh-v0.1.5-rc.1 复核 platform.ts 与 ui-trajectory 注册范例仍有效;0.1.7-rc.2 与 0.2.0-rc.2 按发布包前端产物与 `.d.ts` 类型声明复核平台模块表,槽契约,槽锚点与视图容器样式);判断最新行为以官方仓库现况为准

| 文件 | 用途 |
|:---:|:---:|
| `packages/client/tsdown.client.ts` | clientBundle 预设(client 产物构建链) |
| `packages/client/web/src/platform.ts` | 平台模块表(CLIENT_EXTERNALS 来源) |
| `packages/client/modules/src/index.ts`,`client/manifest.ts` | host 扫描与 serve 机制,boot 协议 |
| `packages/client/ui-trajectory/src/client/index.ts` | 会话区域 tab 注册范例(conversation.view) |
| `packages/client/ui-conversation/src/client/contract/slots.ts` | conversation.view 槽契约(类型家) |
| `packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx` | tab 栏渲染与 renderSlot 调用(owner props) |
| `packages/client/ui-settings-plugins/src/client/index.ts` | 设置页 tab/卡片注册范例(settings.plugins.tab / settings.plugin.item) |
| `packages/client/ui-settings/src/client/contract/slots.ts` | settings 域 slot 契约(类型家) |
| `packages/client/ui-slots/src/index.ts` | slots 核心类型(register/Props*/SlotMap) |
| `packages/client/AGENTS.md` | client 包纪律(导出/ctx/props 四 shares) |
| `docs/web-styling.md` | 样式 token 与组件规则 |
| `packages/host/webserver/src/index.ts` | webserver 服务(register 路由扩展点) |

> 本项目实例:dsh-system-monitor-plugin 在会话区域注册「系统监控」标签页(conversation.view 槽,id `system-monitor`,order 30),数据通道走 host webserver 路由(`/api/system-monitor/snapshot`),面板字典以 `system-monitor` 命名空间注册进宿主 locale 服务并声明在槽注册上,tab 标签与面板文案随界面语言切换;相关项目细节见根目录 `AGENTS.md` 设计细节段