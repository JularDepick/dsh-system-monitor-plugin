<div align="center">

# dsh-system-monitor-plugin

[![Version](https://img.shields.io/badge/Version-0.1.2-green)](https://github.com/JularDepick/dsh-system-monitor-plugin/tree/v0.1.2)
[![Copyright](https://img.shields.io/badge/Copyright-JularDepick-0066AA)](./COPYRIGHT)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue)](./LICENSE)

[English]
| [简体中文](./README.md)

</div>

A plugin for dsh: monitor the resource utilization of dsh system processes and report the results to the user in the form of charts.

## Features

- Automatic collection: CPU usage percentage and memory usage (auto-scaled KB/MB/GB and percentage) of the dsh process and its child processes
- Handle reporting: a reporting tool allows the Agent to report process handles (e.g. subagent processes) that the plugin cannot identify on its own
- Panel-only display: monitoring data is shown on the plugin UI panel only and is not exposed to dsh

## Installation

This release targets dsh 0.2.0-rc.2. Since dsh 0.2.0-rc.2, dsh enforces the dsh-prefixed `peerDependencies` of a plugin (a mismatched plugin is refused both at installation and at startup), so the plugin version must be installed against the matching dsh version.

Install this plugin into a dsh profile:

```sh
dsh plugin --profile <name> add dsh-system-monitor-plugin
```

When distributing a tarball:

```sh
dsh plugin --profile <name> add dsh-system-monitor-plugin-0.1.2.tgz
```

## Usage

After installation and startup, the plugin provides a "System Monitor" tab in the session-area tab bar of the Web UI, showing CPU usage and memory usage (auto-scaled KB/MB/GB and percentage) of monitored processes across two dimensions (per process and per conversation). Resource share is drawn as three fixed lanes — others, DSH and its subprocesses (segmented per member), and idle — each labelled with its percentage of the whole machine, with the process/session name shown inside a segment whenever it fits (the "Settings" button at the top right of the panel toggles this and switches between the side-by-side and stacked panel layouts, and the sub-page closes with ESC). Process handles that need to be monitored are reported by the Agent through the reporting tool during a session.

The format specification of the process reporting mechanism is documented in [Process Reporting Mechanism and Specification](docs/v0.1.0-进程汇报机制与规范.md) (Chinese).

## Related Links

- Plugin template used by this repository: https://github.com/JularDepick/dsh-plugin-dev-agent-template
- dsh official repository: https://github.com/deepseek-ai/deepseek-harness