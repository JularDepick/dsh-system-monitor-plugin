# 翻译文件规范(translation-ini)

## 存放位置

翻译文件存放于 `src/translation/` 目录

## 命名规范

翻译文件命名遵循 `xx-YY.ini` 格式:

- `xx`: 语言代码,小写,遵循 ISO 639-1,如 `zh`,`en`
- `YY`: 地区代码,大写,遵循 ISO 3166-1 alpha-2,如 `CN`,`US`

示例: `zh-CN.ini`(简体中文),`en-US.ini`(美式英语)

## 文件内容

- 使用 INI 格式,UTF-8 编码
- 翻译 ini 中不使用注释
- 文件结构包含两个节:
  - `[meta]`: 翻译文件的元信息,包含以下键:
    - `for`: 本翻译文件对应的插件版本号,必须写成带 `v` 前缀的形式(如 `v0.3.3`),校验器要求它与 `v` 加 `package.json` 版本完全相等
    - `lang`: 语言代码,与文件名 `xx-YY` 一致
    - `name`: 语言显示名(供人工查阅与新增语言时识别,运行时不参与 UI 展示: 界面语言由宿主 locale 服务与客户端字典决定)
    - `endtime`: 最近维护时间,遵循守则日期格式 `yyyy-MM-dd HH:mm:ss+HH:mm`
  - `[translation]`: UI 文案键值对,键名使用英文,值使用对应语言的文案
- 新增翻译文件时,以 `src/translation/.example_zh-CN.ini` 为基准模板(简体中文版复刻),从该模板翻译更新为 `xx-YY.ini`,改写 `[meta]` 各键后翻译 `[translation]` 键值;同时在 `src/client/i18n.ts` 增加该语言的字典并纳入 locale 注册 —— INI 运行时不加载,只加 INI 不会让界面出现新语言

## 模板维护流程

- `src/translation/.example_zh-CN.ini` 是翻译文件的基准模板,内容即简体中文版,与 `zh-CN.ini` 保持一致
- 版本迭代时直接维护该基准模板(补充,调整 `[translation]` 键值),并保持 `zh-CN.ini` 与基准模板一致
- 模板更新后,其余语言版本(如 `en-US.ini`)从模板翻译更新,保持各语言键集一致

## 语言切换机制

- 面板文案由客户端字典(`src/client/i18n.ts`)提供,经宿主 locale 服务的命名空间注册,随宿主界面语言切换
- `src/translation/` 下的 INI 文件**不参与运行时加载**,只作键集参照与新增语言的翻译预设随包分发
- 字典与 INI 的键集与占位符需保持双向一致;`scripts/syntax-check.mjs`(经 `pnpm run check` 触发)逐项校验: 目录扫描发现全部 ini,`[meta]` 四键齐全且 `lang` 与文件名一致,`for` 与 `package.json` 版本一致,`endtime` 时间格式合法,无注释行与 BOM,无重复键,无空取值,英文文件不含中日韩与全角字符,zh 与 en 两份 ini 的键集与占位符一致,模板 `.example_zh-CN.ini` 与 `zh-CN.ini` 逐字节一致,两套字典与各自 ini 之间(含取值逐字相同),界面用到的字面键均有词条,调用点传入的变量与模板占位符一一对应,以及词条确实被界面引用(无死键)
