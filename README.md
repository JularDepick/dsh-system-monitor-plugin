<div align="center">

# dsh-system-monitor-plugin

[![Version](https://img.shields.io/badge/Version-0.1.1-green)](https://github.com/JularDepick/dsh-system-monitor-plugin/tree/v0.1.1)
[![Copyright](https://img.shields.io/badge/Copyright-JularDepick-0066AA)](./COPYRIGHT)
[![License](https://img.shields.io/badge/License-MIT-yellow)](./LICENSE)

[English](./README_en-US.md)
| [简体中文]

</div>

面向 dsh 的插件:监控 dsh 系统进程的资源占用,并以图表形式向用户报告结果。

## 特性

- 自动采集:dsh 进程及其派生子进程的 CPU 占用率与内存占用(GB、百分比)
- 句柄汇报:提供汇报工具,Agent 可主动上报 subagent 等插件无法自主识别的进程句柄
- 面板展示:监控数据只在插件 UI 面板展示,不暴露给 dsh 使用

## 安装

本版本适配 dsh 0.1.7-rc.2。

将本插件安装到 dsh profile:

```sh
dsh plugin --profile <name> add dsh-system-monitor-plugin
```

使用 tarball 分发时:

```sh
dsh plugin --profile <name> add dsh-system-monitor-plugin-0.1.1.tgz
```

## 使用

安装并启动后,插件在 Web UI 会话区域标签栏提供「系统监控」标签页,展示被监控进程的 CPU 占用率与内存占用(GB、百分比);需要纳入监控的外部进程句柄,由 Agent 在会话中通过汇报工具上报。

进程汇报机制的格式规范见 [进程汇报机制与规范](docs/v0.1.0-进程汇报机制与规范.md)。

## 相关链接

- 本仓库使用的插件模板:https://github.com/JularDepick/dsh-plugin-dev-agent-template
- dsh 官方仓库:https://github.com/deepseek-ai/deepseek-harness
