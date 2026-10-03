<div align="center">

# dsh-system-monitor-plugin

[![Version](https://img.shields.io/badge/Version-0.1.2-green)](https://github.com/JularDepick/dsh-system-monitor-plugin/tree/v0.1.2)
[![Copyright](https://img.shields.io/badge/Copyright-JularDepick-0066AA)](./COPYRIGHT)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue)](./LICENSE)

[English](./README_en-US.md)
| [简体中文]

</div>

面向 dsh 的插件:监控 dsh 系统进程的资源占用,并以图表形式向用户报告结果。

## 特性

- 自动采集:dsh 进程及其派生子进程的 CPU 占用率与内存占用(按量级自适应 KB/MB/GB、百分比)
- 句柄汇报:提供汇报工具,Agent 可主动上报 subagent 等插件无法自主识别的进程句柄
- 面板展示:监控数据只在插件 UI 面板展示,不暴露给 dsh 使用

## 安装

本版本适配 dsh 0.2.0-rc.2。dsh 自 0.2.0-rc.2 起会强制校验插件的 dsh 前缀 `peerDependencies`（不匹配的插件在安装与启动时都被拒绝），因此插件版本必须与 dsh 版本对应安装。

将本插件安装到 dsh profile:

```sh
dsh plugin --profile <name> add dsh-system-monitor-plugin
```

使用 tarball 分发时:

```sh
dsh plugin --profile <name> add dsh-system-monitor-plugin-0.1.2.tgz
```

## 使用

安装并启动后,插件在 Web UI 会话区域标签栏提供「系统监控」标签页,分三个区域展示被监控进程的 CPU 占用率与内存占用(按量级自适应 KB/MB/GB、百分比):本会话进程资源(只统计当前对话的进程)、进程资源、对话资源;资源占比按三段固定泳道呈现——其他、DSH 及其子进程(按成员分段)、空闲,各段标出占整机的百分比,并在放得下时于段内显示进程名/对话名(面板右上角「配置」按钮可开关该显示,并可选择单列 / 双列两种视图列数,子页按 ESC 关闭;三个区域的标题可点击折叠或展开对应内容);需要纳入监控的外部进程句柄,由 Agent 在会话中通过汇报工具上报。

进程汇报机制的格式规范见 [进程汇报机制与规范](docs/v0.1.0-进程汇报机制与规范.md)。

## 相关链接

- 本仓库使用的插件模板:https://github.com/JularDepick/dsh-plugin-dev-agent-template
- dsh 官方仓库:https://github.com/deepseek-ai/deepseek-harness
