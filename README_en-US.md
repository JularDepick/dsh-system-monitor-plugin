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

- Automatic collection: CPU usage percentage and memory usage (auto-scaled KB/MB/GB and percentage, values below 0.01% shown as `<0.01%`) of the dsh process and its child processes
- Container quota basis: percentages are computed against the CPU and memory quota of the running environment itself (falling back to the visible totals when no quota is readable), so readings inside a container are not diluted by host totals
- Session attribution: processes are attributed to sessions through terminal mapping, explicit reporting and session environment variables, and the panel presents four dimensions: this session, all processes, sessions and subagents
- Short-term trend and tool calls: the panel draws a short-term trend line of the total dsh-side CPU usage and marks the intervals of tool calls
- Handle reporting: a reporting tool allows the Agent to report process handles (e.g. subagent processes) that the plugin cannot identify on its own
- Panel-only display: monitoring data is shown on the plugin UI panel only and is not exposed to dsh

## Installation

This release targets dsh 0.2.0-rc.2. Since dsh 0.2.0-rc.2, dsh enforces the dsh-prefixed `peerDependencies` of a plugin (a mismatched plugin is refused both at installation and at startup), so the plugin version must be installed against the matching dsh version.

This plugin works in both the `web` and `desktop` dsh profiles, installed from the same package; only the UI host environment differs (Web UI session-area tab / the same slot on desktop), while collection and panel behavior stay identical.

Install this plugin into a dsh profile:

```sh
dsh plugin --profile <name> add dsh-system-monitor-plugin
```

When distributing a tarball:

```sh
dsh plugin --profile <name> add dsh-system-monitor-plugin-0.1.2.tgz
```

## Usage

After installation and startup, the plugin provides a "System Monitor" tab in the session-area tab bar of the Web UI, showing CPU usage and memory usage (auto-scaled KB/MB/GB and percentage, values below 0.01% shown as `<0.01%`) of monitored processes across four dimensions: this session's processes, all processes, sessions, and subagents (only processes attributed to a subagent)

Each card carries the totals of its dimension, a three-lane resource share bar (others, DSH and its subprocesses (segmented per member), and idle; each lane is labelled with its percentage of the whole machine, with the process/session name shown inside a segment whenever it fits) and a detail table; clicking a card title collapses or expands that card. Below the cards a short-term trend line plots the recent total dsh-side CPU usage and marks the intervals of tool calls with vertical bars

Detail tables can be sorted by CPU, memory or name, and the optional columns (PID, parent, session, memory percentage) can be hidden; a process or session that was sampled before does not disappear as soon as a later round misses it — it stays with zeroed values and is removed automatically only after several consecutive rounds without a sample (10 by default, configurable), and any row can also be removed manually (it comes back once sampled again)

The "Settings" button at the top right of the panel opens an in-panel settings sub-page to toggle in-lane names, switch the CPU scope (whole machine / per core), the view columns (single / two-column), the table sort (default / CPU / memory / name) and the visible columns (per-column toggles), and to copy the current snapshot as text; settings and collapse states are kept in browser-side local preferences. Card folding and the settings sub-page are both keyboard operable (ESC closes the sub-page)

Process handles that need to be monitored are reported by the Agent through the reporting tool during a session

The handle fields of the reporting mechanism (identity, parent process, process name, session id, and the like) and the deduplication rules are documented in the reporting tool's parameter description inside the plugin.

## Related Links

- Plugin template used by this repository: https://github.com/JularDepick/dsh-plugin-dev-agent-template
- dsh official repository: https://github.com/deepseek-ai/deepseek-harness