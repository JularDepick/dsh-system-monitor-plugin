<div align="center">

# dsh-system-monitor-plugin

[![Version](https://img.shields.io/badge/Version-0.1.2-green)](https://github.com/JularDepick/dsh-system-monitor-plugin/tree/v0.1.2)
[![Copyright](https://img.shields.io/badge/Copyright-JularDepick-0066AA)](./COPYRIGHT)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue)](./LICENSE)

[English](./README_en-US.md)
| [简体中文]

</div>

面向 dsh 的插件:监控 dsh 系统进程的资源占用,并以图表形式向用户报告结果

## 特性

- 自动采集:dsh 进程及其派生子进程的 CPU 占用率与内存占用(按量级自适应 KB/MB/GB,百分比,小于 0.01% 显示为 `<0.01%`)
- 容器配额口径:百分比分母取运行环境自身的 CPU 与内存配额(读不到配额时回退可见总量),故容器内读数不按宿主机总量摊薄
- 会话归属:进程按终端映射、显式汇报与会话环境变量归属到会话,面板按 本会话 / 全部进程 / 会话 / 子代理 四个维度分别展示
- 短期趋势与工具调用:面板画出一条 dsh 侧 CPU 合计的短期趋势线,并标注工具调用的时段
- 句柄汇报:提供汇报工具,Agent 可主动上报 subagent 等插件无法自主识别的进程句柄
- 面板展示:监控数据只在插件 UI 面板展示,不暴露给 dsh 使用

## 安装

本版本适配 dsh 0.2.0-rc.2,dsh 自 0.2.0-rc.2 起会强制校验插件的 dsh 前缀 `peerDependencies`(不匹配的插件在安装与启动时都被拒绝),因此插件版本必须与 dsh 版本对应安装

本插件适用于 dsh 的 `web` 与 `desktop` 两个 profile,两者用同一份插件包安装;差异只在界面宿主环境(Web UI 会话区域标签页 / 桌面端同一槽位),采集机制与面板行为一致

将本插件安装到 dsh profile:

```sh
dsh plugin --profile <name> add dsh-system-monitor-plugin
```

使用 tarball 分发时:

```sh
dsh plugin --profile <name> add dsh-system-monitor-plugin-0.1.2.tgz
```

## 使用

安装并启动后,插件在 Web UI 会话区域标签栏提供「系统监控」标签页,按四个维度展示被监控进程的 CPU 占用率与内存占用(按量级自适应 KB/MB/GB,百分比,小于 0.01% 显示为 `<0.01%`):本会话进程资源(只统计当前会话的进程),进程资源,会话资源,子代理资源(只统计归属为子代理的进程)

每张卡含该维度的合计、三段固定泳道的资源占比条(其他,DSH 及其子进程(按成员分段),空闲;各段标出占整机的百分比,放得下时于段内显示进程名/会话名)与明细表;卡片标题可点击折叠或展开该卡内容。面板下方另有一条短期趋势线,画出 dsh 侧 CPU 合计的近期走势,并以竖条标注工具调用时段

明细表可按 CPU、内存或名称排序,并可隐藏 PID、父进程、会话、内存占比等可选列;已采样到的进程或会话在后续某轮未被采样时不会立即消失,而是归零保留,连续多轮未出现(默认 10 轮,可配置)后自动移除,也可逐行手动移除(该行再次被采样到会自动补回)

面板右上角「配置」按钮呼出面板内配置子页,可开关泳道内名称、切换 CPU 口径(整机 / 单核)、视图列数(单列 / 双列)、表格排序(默认 / CPU / 内存 / 名称)与显示列(逐列开关),并把当前快照复制为文本;设置与折叠状态记在浏览器端本地偏好。卡片折叠与配置子页均可用键盘操作(ESC 收起配置子页)

需要纳入监控的外部进程句柄,由 Agent 在会话中通过汇报工具上报

进程汇报机制的句柄字段(标识,父进程,进程名,会话标识等)与去重回执规则,见插件内的汇报工具参数说明

## 相关链接

- 本仓库使用的插件模板:https://github.com/JularDepick/dsh-plugin-dev-agent-template
- dsh 官方仓库:https://github.com/deepseek-ai/deepseek-harness
