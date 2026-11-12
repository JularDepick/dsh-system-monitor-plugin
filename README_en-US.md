<div align="center">

# dsh-system-monitor-plugin

[![Version](https://img.shields.io/badge/Version-0.3.3-green)](https://github.com/JularDepick/dsh-system-monitor-plugin/tree/v0.3.3)
[![Copyright](https://img.shields.io/badge/Copyright-JularDepick-0066AA)](./COPYRIGHT)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue)](./LICENSE)

English | [简体中文](./README.md)

</div>

A plugin for dsh: monitor the resource utilization of dsh processes and their spawned children, and report the results in panel charts

Supports dsh 0.2.1-rc.1 through 0.2.2-rc.2

---


## Features

- Automatic collection: CPU usage percentage and memory usage of the dsh process and its child processes (auto-scaled KB/MB/GB, exactly 0 shown as `0 B`; percentages in three tiers: exactly 0 shown as `0%`, below 0.01% shown as `<0.01%`, otherwise two decimals)
- Container quota basis: percentages are computed against the CPU and memory quota of the running environment itself (falling back to the visible totals when no quota is readable), so readings inside a container are not diluted by host totals
- Session attribution: processes are attributed to sessions through terminal mapping, explicit reporting, session environment variables and the child processes spawned by commands run in a session; the subprocess-entry source is active on every platform (on Windows and macOS, which cannot read process environments, it is the primary source; on Linux and WSL it identifies the intermediate layer of the systemd transient scope while the process environment fills in the rest of the chain), and the panel presents them across four dimensions: this session / all processes / sessions / subagents
- Standalone palette: the panel uses its own blue-and-white palette (light and dark variants); share bars and table swatches are colored by role, with a fixed semantic color for the main process and host, the subagent total, other applications and idle
- Lane color pool: ordinary processes and sessions take pool colors in order, and the pool can be added to, edited or trimmed in the plugin config and in the panel settings sub-page (16 colors by default, limited to 10 to 64); when there are more members than pool colors the lane color strategy decides, recycling existing colors (default) or auto-inserting the midpoint between two neighbouring colors (colors added this way and the next candidate cursor are kept in panel memory only, and replay from the same data after a refresh)
- Handle reporting: a reporting tool allows the Agent to report process handles (e.g. subagent processes) that the plugin cannot identify on its own
- Status and diagnostics: the panel reports one of three states (normal / degraded / data source unavailable; degradation has four causes - the query source fell back to a secondary command, some processes could be listed but not read (insufficient permissions), so their CPU lands in idle while their memory is absorbed by other applications, the round sampled nothing / missed the dsh root process, or an earlier snapshot exists while this round's query failed (the failure reason is attached then), and the system info row lists the sampling time, platform, poll interval, logical processors, total memory, the container quota when present, the dsh process identity and the other-application process count, plus the unreadable process count when any process could not be read; CPU or memory values at or above 90% are highlighted
- Panel-only display: monitoring data is shown on the plugin UI panel only and is not exposed to dsh


## Installation

This release supports dsh 0.2.1-rc.1 through 0.2.2-rc.2: since 0.2.1-rc.1 dsh decides by the manifest `engines.dsh` range alone when one is declared (peers are then ignored), while 0.2.0-rc.2 checks only the dsh-prefixed `peerDependencies`; this plugin declares the same supported set in both places, and dsh 0.2.0-rc.2 or newer but outside that set is refused at installation and at startup; dsh older than 0.2.0-rc.2 has no compatibility gate and is not supported

This plugin works in both the `web` and `desktop` dsh profiles, installed from the same package; only the UI host environment differs (Web UI session-area tab / the same slot on desktop), while collection and panel behavior stay identical (in-repository testing covers the `web` profile; `desktop` reuses the same package but has not been verified item by item)

Runtime requirement: Node.js 20 or newer (the `engines.node` field in `package.json`)

Supported operating systems: Windows, Linux (including WSL) and macOS; other Unix-like platforms (the BSD variants, Solaris, AIX) reuse the macOS ps chain. Windows and Linux (including WSL) are covered by real-machine testing; macOS and the other platforms implement the same parsing rules but have not been verified on each platform

Upgrading from an older version only needs the new package: plugin config and panel local preferences carry over unchanged, and reported handles are reported again by the Agent when needed

Install this plugin into a dsh profile:

```sh
dsh plugin --profile <name> add dsh-system-monitor-plugin
```

When distributing a tarball:

```sh
dsh plugin --profile <name> add ./dsh-system-monitor-plugin-0.3.3.tgz
```


## Usage

After installation and startup, the plugin provides a "System Monitor" tab in the session-area tab bar of the Web UI, showing CPU usage and memory usage of monitored processes across four dimensions (auto-scaled KB/MB/GB; percentages in three tiers: exactly 0 shown as `0%`, below 0.01% shown as `<0.01%`, otherwise two decimals): this session's processes (the current session plus the subagent sessions it spawned, with subagent rows marked and their total shown in the card head), processes, sessions (sessions attributed to a subagent are merged into a single subagent total row), subagents (each subagent listed separately, those spawned by the current session first and marked as this session)

Each card carries the totals of its dimension, a resource share bar of three fixed lanes (others, DSH and its subprocesses (segmented per member), idle; each lane is labelled with its percentage of the whole machine, and the process/session name is shown inside a segment whenever it fits) and a detail table; clicking a card title collapses or expands that card

Detail tables can be sorted by CPU, memory or name, and the optional columns (PID, parent, session, memory percentage) can be hidden; a process or session that was sampled before does not disappear as soon as a later round misses it, but stays with zeroed values and is removed automatically only after several consecutive rounds without a sample (10 by default, range 5 to 60, adjustable in the plugin config and the panel settings sub-page), and any row can also be removed manually (it comes back once sampled again)

The "Settings" button at the top right of the panel opens an in-panel settings sub-page to toggle in-lane names, switch the CPU scope (whole machine / single core), the view columns (single / two-column), the table sort (default / CPU / memory / name) and the visible columns (per-column toggles), adjust the row retention rounds, switch the lane color strategy (recycle existing / auto-insert midpoints) and add, edit or remove lane pool colors, and to copy the current snapshot as text (its header carries the round status, plus a failure-reason line when one exists and an unreadable-process count when any process was unreadable); settings and collapse states are kept in browser-side local preferences; card folding and the settings sub-page are both keyboard operable (ESC closes the sub-page)

Process handles that need to be monitored are reported by the Agent through the reporting tool during a session; repeated handles are merged by process id, a single call carries at most 256 handles, names and session ids are limited to 120 and 200 characters; handles beyond the per-call limit are not counted as rejected but reported by their real count in the receipt message, while only handles that fail per-item validation land in the receipt rejection list

The handle fields of the reporting mechanism (identity, parent process, process name, session id, and the like) and the deduplication rules are documented in the parameter description of the reporting tool `system_monitor_report` inside the plugin

Plugin config keys (generated in the dsh settings page from the plugin schema): poll interval `pollInterval` (250 to 60000 ms, 1000 by default), in-lane names `laneNames`, view columns `columns`, CPU scope `cpuScope`, row retention rounds `retainRounds` (5 to 60, 10 by default), lane color pool `laneColorPool` (10 to 64 colors) and lane color strategy `laneColorStrategy`; the same keys in the panel's browser-side preferences take precedence over the plugin config


## Directory Structure

```
dsh-system-monitor-plugin/
├── .gitignore          # git ignore rules
├── AGENTS.md           # development rules and project information
├── COPYRIGHT           # copyright notice
├── LICENSE             # license
├── README.md           # Chinese main README
├── README_en-US.md     # English README
├── cordis.patch.yml    # config-layer patch
├── package.json        # package manifest and build scripts
├── pnpm-lock.yaml      # locked dependency versions
├── pnpm-workspace.yaml # pnpm workspace declaration
├── tsconfig.json       # type-check configuration
├── tsdown.config.ts    # build configuration
├── version.index.md    # version index
├── docs/               # project docs (official plugin dev docs, dsh web tab guide, tech specs, tag and release spec)
├── scripts/            # helper scripts (syntax check, client bundle check, post-pack cleanup and move, official docs check)
└── src/                # project source (entry, config, constants, client, monitor, translation)
```


## Copyright

Copyright &copy; 2026 JularDepick

See [COPYRIGHT](./COPYRIGHT)


## License

This repository is licensed under the [Apache-2.0 License](./LICENSE)


## Related Links

- Plugin template used by this repository: https://github.com/JularDepick/dsh-plugin-dev-agent-template
- dsh official repository: https://github.com/deepseek-ai/deepseek-harness
