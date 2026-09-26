/*
 * tsdown 构建配置
 *
 * 两份配置:服务端 bundle(ESM + 类型)与客户端 bundle
 * (CJS 包装为 window.__ModuleLoader__.load,产物 dist/client.js)。
 * 构建产物输出到 dist/;pack tarball 由 postpack 归位到 release/。
 * 客户端构建链约定遵循 docs/dsh-web-tab-experience.md。
 * 作者:JularDepick
 */

import { defineConfig } from 'tsdown'

/** 宿主冻结的平台模块表(dsh 0.1.7-rc.2 发布包核对,与 0.1.5-rc.1 逐项一致;客户端 bundle 一律外部化,运行时由宿主提供) */
const PLATFORM_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node20',
    dts: true,
    clean: true,
  },
  {
    entry: ['src/client/index.tsx'],
    format: ['cjs'],
    platform: 'browser',
    target: 'es2022',
    dts: false,
    outputOptions: { entryFileNames: 'client.js' },
    deps: { neverBundle: PLATFORM_EXTERNALS },
    banner: 'var module = { exports: {} }; var exports = module.exports;\nwindow.__ModuleLoader__.load({ id: "dsh-system-monitor-plugin", factory: (require) => {',
    footer: 'return module.exports; } });',
  },
])