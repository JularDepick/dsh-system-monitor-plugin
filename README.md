<div align="center">

# dsh-system-monitor-plugin

[![Version](https://img.shields.io/badge/Version-0.3.4-green)](https://github.com/JularDepick/dsh-system-monitor-plugin/tree/v0.3.4)
[![Copyright](https://img.shields.io/badge/Copyright-JularDepick-0066AA)](./COPYRIGHT)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue)](./LICENSE)

[English](./README_en-US.md) | 简体中文

</div>

面向 dsh 的插件: 监控 dsh 进程及其派生子进程的资源占用,并以面板图表向用户报告结果

支持 dsh 0.2.1-rc.1 至 0.2.2-rc.3

---


## 特性

- 自动采集: dsh 进程及其派生子进程的 CPU 占用率与内存占用(按量级自适应 KB/MB/GB,确切 0 显示 `0 B`;百分比三档: 确切 0 显示 `0%`,小于 0.01% 显示 `<0.01%`,其余两位小数)
- 容器配额口径: 百分比分母取运行环境自身的 CPU 与内存配额(读不到配额时回退可见总量),故容器内读数不按宿主机总量摊薄
- 会话归属: 进程按终端映射,显式汇报,会话环境变量与会话中执行命令所派生的进程归属到会话;派生入口这条信源在所有平台启用(Windows 与 macOS 读不到进程环境,它是主信源;Linux 与 WSL 上它负责认出 systemd 瞬态 scope 的中间层,其余链尾进程由进程环境补齐),面板按 本会话 / 全部进程 / 会话 / 子代理 四个维度分别展示
- 独立配色: 面板使用自带的蓝白色调(含浅色与深色两套);占比条与表格配色块按语义分配,主进程与宿主,子代理合计,其他应用与空闲各有固定语义色
- 泳道预备颜色池: 普通进程与会话按顺序取池内颜色,颜色池可在插件配置与面板设置子页中增删改(默认 16 色,限定 10 至 64 色);成员数超过池容量时按取色方案处理,循环复用(默认)或自动取相邻两色的中间色插入颜色池(取间色新增的色与下一次的候选起点写入浏览器端本地偏好(与其它面板偏好同一存储),刷新后沿用同一份池与候选起点)
- 句柄汇报: 提供汇报工具,Agent 可主动上报 subagent 等插件无法自主识别的进程句柄
- 运行状态与诊断: 面板给出 正常 / 降级模式 / 数据源不可用 三种状态(降级有四类成因:查询源回退到次选命令;有进程可枚举但无权读取,其 CPU 会被算进空闲,内存被并入其他应用;本轮采样为空或采样结果里没有 dsh 根进程;已有旧快照但本轮查询失败,此时一并附上失败原因),系统信息行列出采样时间,平台,轮询间隔,逻辑处理器,总内存,容器配额(存在时),dsh 进程标识与其他应用进程数,存在不可读进程时另给出一行;CPU 或内存占用达到 90% 的数值高亮显示(阈值恒按整机口径判定,切换单核展示不改变告警时机)
- 面板展示: 监控数据只在插件 UI 面板展示,不暴露给 dsh 使用


## 安装

本版本同时适配 dsh 0.2.1-rc.1 至 0.2.2-rc.3(区间 `>=0.2.1-rc.1 <0.2.3-rc.1`):dsh 自 0.2.1-rc.1 起在 manifest 声明了 `engines.dsh` 时由该范围单独决定(此时 peer 不参与判定),0.2.0-rc.2 只校验 dsh 前缀 `peerDependencies`;本插件两处声明同一组受支持版本,0.2.0-rc.2 及更新但落在该区间外的 dsh 版本,在安装与启动时都会被拒绝;早于 0.2.0-rc.2 的 dsh 没有兼容性拦截,不在支持范围

本插件适用于 dsh 的 `web` 与 `desktop` 两个 profile,两者用同一份插件包安装;差异只在界面宿主环境(Web UI 会话区域标签页 / 桌面端同一槽位),采集机制与面板行为一致;仓库内的实测记录覆盖 `web` profile,`desktop` 复用同一份插件包但未逐项实测

运行要求: Node.js 20 及以上(见 `package.json` 的 `engines.node`)

支持的操作系统: Windows,Linux(含 WSL)与 macOS,其余类 Unix 平台(各 BSD,Solaris,AIX)复用 macOS 的 ps 采集链;Windows 与 Linux(含 WSL)有真机实测覆盖,macOS 与其余平台按同一套解析规则实现,尚未逐平台实测

从旧版本升级时直接安装新版本即可: 插件配置项与面板本地偏好沿用,不需要重新配置,已汇报的句柄由 Agent 在需要时重新上报

将本插件安装到 dsh profile:

```sh
dsh plugin --profile <name> add dsh-system-monitor-plugin
```

使用 tarball 分发时:

```sh
dsh plugin --profile <name> add ./dsh-system-monitor-plugin-0.3.4.tgz
```


## 使用

安装并启动后,插件在 Web UI 会话区域标签栏提供「系统监控」标签页,按四个维度展示被监控进程的 CPU 占用率与内存占用(按量级自适应 KB/MB/GB;百分比三档: 确切 0 显示 `0%`,小于 0.01% 显示 `<0.01%`,其余两位小数): 本会话进程资源(统计当前会话及其派生的子代理进程,子代理进程行带「子代理」标注且卡头另给其中子代理合计),进程资源,会话资源(其中归属为子代理的会话并成一行「子代理」合计),子代理资源(逐个展示各子代理,属于当前会话派生的排在前并标注「本会话」)

每张卡含该维度的合计,三段固定泳道的资源占比条(其他,DSH 及其子进程(按成员分段),空闲;各段标出占整机的百分比,放得下时于段内显示进程名/会话名)与明细表;卡片标题可点击折叠或展开该卡内容

明细表可按 CPU,内存或名称排序,并可隐藏 PID,父进程,会话,内存占比等可选列;已采样到的进程或会话在后续某轮未被采样时不会立即消失,而是归零保留,连续多轮未出现(默认 10 轮,范围 5 至 60,可在插件配置与面板设置子页调整)后自动移除,也可逐行手动移除(该行再次被采样到会自动补回)

面板右上角「配置」按钮呼出面板内配置子页,可开关泳道内名称,切换 CPU 口径(整机 / 单核),视图列数(单列 / 双列),表格排序(默认 / CPU / 内存 / 名称)与显示列(逐列开关),调整行留存轮数,切换泳道颜色取色方案(循环使用 / 自动取间色新增),增删改泳道预备颜色池,并把当前快照复制为文本(文本首部给出本轮状态,存在查询失败原因时附原因行,存在不可读进程时附不可读进程数);设置与折叠状态记在浏览器端本地偏好;卡片折叠与配置子页均可用键盘操作(ESC 收起配置子页)

需要纳入监控的外部进程句柄,由 Agent 在会话中通过汇报工具上报;同一个句柄重复上报按进程标识合并,单次最多 256 条,名称与会话标识分别限 120 与 200 字符;超出单批上限的条数不进拒绝计数,而是在回执文案里给出真实条数,逐条校验失败的项才计入回执的拒绝列表

进程汇报机制的句柄字段(标识,父进程,进程名,会话标识等)与去重回执规则,见插件内的汇报工具 `system_monitor_report` 的参数说明

插件配置项(在 dsh 设置页按插件 schema 生成): 轮询间隔 `pollInterval`(250 至 60000 毫秒,默认 1000),泳道内名称 `laneNames`,视图列数 `columns`,CPU 口径 `cpuScope`,行留存轮数 `retainRounds`(5 至 60,默认 10),泳道预备颜色池 `laneColorPool`(10 至 64 色),取色方案 `laneColorStrategy`;面板本地偏好里的同名项优先于插件配置


## 目录结构

```
dsh-system-monitor-plugin/
├── .gitignore          # git 忽略规则
├── AGENTS.md           # 开发协作守则与项目信息
├── COPYRIGHT           # 版权声明
├── LICENSE             # 许可证
├── README.md           # 中文主 README
├── README_en-US.md     # 英文 README
├── cordis.patch.yml    # 配置层 patch
├── package.json        # 包清单与构建脚本
├── pnpm-lock.yaml      # 依赖版本锁定
├── pnpm-workspace.yaml # pnpm workspace 声明
├── tsconfig.json       # 类型检查配置
├── tsdown.config.ts    # 构建配置
├── version.index.md    # 版本号索引
├── docs/               # 项目文档(官方插件开发文档, dsh web tab 开发经验, 技术规范, Tag 与 Release 规范)
├── scripts/            # 辅助脚本(语法验证, 客户端产物校验, 打包后置清理与归位, 官方文档收录校验)
└── src/                # 项目源码(插件入口, 配置, 常量, 客户端, 监控, 翻译)
```


## 版权信息

Copyright &copy; 2026 JularDepick

详见 [COPYRIGHT](./COPYRIGHT)


## 许可证

本仓库采用 [Apache-2.0 许可证](./LICENSE)


## 相关链接

- 本仓库使用的插件模板: https://github.com/JularDepick/dsh-plugin-dev-agent-template
- dsh 官方仓库: https://github.com/deepseek-ai/deepseek-harness
