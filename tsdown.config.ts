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

/**
 * 宿主冻结的平台模块表(客户端 bundle 一律外部化,运行时由宿主提供)。
 * 只列客户端产物真正 value-import 的包:产物当前只产生 react, react/jsx-runtime
 * 与 @deepseek-ai/dsh-client-ui-primitives 三个 require,多列未引用的 seed 词
 * 不会改变产物,却会让清单与规范(只列真实 value-import)不一致。
 * 清单取受支持 dsh 版本(0.2.1-rc.1 至 0.2.2-rc.2 的七版)平台模块表的公共子集:
 * 该表在 0.2.1-rc.1 至 0.2.1-rc.5 逐项一致(rc.4 与 rc.5 的前端产物与 rc.3
 * 逐一哈希相同),0.2.2-rc.1 与 0.2.2-rc.2 复核为同一份十一项;0.2.1-rc.1 起新增的 zod 与
 * @tanstack/react-virtual 本插件不引入,故不列入
 */
const PLATFORM_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/dsh-client-ui-primitives',
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
    // CJS 前奏必须落在 factory 体内:放在脚本顶层会让 var 声明落到页面全局,
    // 把 window.module / window.exports 换成本插件的导出对象,并依赖宿主同步执行工厂
    banner: 'window.__ModuleLoader__.load({ id: "dsh-system-monitor-plugin", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
])