/*
 * 客户端产物结构校验
 *
 * 客户端 bundle 由 tsdown 以 CJS 包装成 window.__ModuleLoader__.load({ id, factory }),
 * 结构一旦走样(前奏落到脚本顶层、footer 不闭合、require 集合超出宿主平台模块表)
 * 在浏览器端表现为插件加载失败或全局变量污染,本地却很难察觉,故在 check 里断言:
 *   1. 顶层只有 load 调用,CJS 前奏在 factory 体内,footer 与 banner 配平;
 *   2. require 的包名是宿主平台模块表的子集,且该表与 tsdown 的 PLATFORM_EXTERNALS 同值;
 *   3. 在无 module/exports 的沙箱里执行后,页面全局不新增 module/exports,导出含 name/inject/apply。
 * 断言按「报错即失败」处理:模块作用域抛错、缺产物字段都算失败(只提示会让崩溃产物过门禁)。
 * dist/client.js 不存在时(未构建)跳过并提示,不视为失败。
 */

import { existsSync, readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'

/** 宿主平台模块表(与 tsdown 的外部化清单保持一致) */
const PLATFORM_MODULES = ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives']

const file = 'dist/client.js'
const failures = []

/** 去掉注释与空白,用于判断前奏是否只剩 window. */
function stripNoise(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s+/g, '')
}

if (!existsSync(file)) {
  console.log('客户端产物校验: 未找到 ' + file + '(先构建再校验),本次跳过')
} else {
  const text = readFileSync(file, 'utf8')
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const loaderAt = text.indexOf('__ModuleLoader__')

  // 1. 结构:前奏只允许 window. 前缀,任何其他语句都会落到页面全局
  if (loaderAt < 0) {
    failures.push('未找到 __ModuleLoader__ 装载调用')
  } else {
    const prelude = stripNoise(text.slice(0, loaderAt))
    if (prelude !== '' && prelude !== 'window.') {
      failures.push('脚本顶层出现 load 调用之外的内容: ' + prelude.slice(0, 60))
    }
  }
  if (!/factory:\s*\(require\)\s*=>\s*\{\s*var module = \{ exports: \{\} \}; var exports = module\.exports;/.test(text)) {
    failures.push('banner 未把 CJS 前奏放进 factory 体内')
  }
  if (!/return module\.exports; \} \}\);\s*$/.test(text)) {
    failures.push('footer 未按 return module.exports; } }); 收尾')
  }
  const idMatch = /id:\s*"([^"]+)"/.exec(text)
  if (idMatch === null) failures.push('未找到 __ModuleLoader__.load 的 id')
  else if (idMatch[1] !== pkg.name) failures.push('bundle id 与包名不一致: ' + idMatch[1])

  // 1b. 插件名的两处字面量(常量与服务端入口)必须与包名一致
  if (existsSync('src/constants.ts')) {
    const constant = /export const PLUGIN_NAME = '([^']+)'/.exec(readFileSync('src/constants.ts', 'utf8'))
    if (constant === null) failures.push('未在 src/constants.ts 找到 PLUGIN_NAME')
    else if (constant[1] !== pkg.name) failures.push('PLUGIN_NAME 与包名不一致: ' + constant[1])
  }

  // 2. require 集合必须是平台模块表的子集(单双引号都要认,否则可被静默绕过)
  const required = [...new Set([...text.matchAll(/require\(\s*(['"])([^'"]+)\1\s*\)/g)].map((m) => m[2]))].sort()
  for (const name of required) {
    if (!PLATFORM_MODULES.includes(name)) failures.push('require 了平台模块表之外的包: ' + name)
  }

  // 2b. 外部化清单与 tsdown 配置必须同值(两份清单分开维护,漏改会让白名单静默放宽)
  if (existsSync('tsdown.config.ts')) {
    const block = /const PLATFORM_EXTERNALS = \[([\s\S]*?)\]/.exec(readFileSync('tsdown.config.ts', 'utf8'))
    if (block === null) {
      failures.push('tsdown.config.ts 未找到 PLATFORM_EXTERNALS 清单')
    } else {
      const fromConfig = [...new Set([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))].sort()
      if (fromConfig.join(',') !== [...PLATFORM_MODULES].sort().join(',')) {
        failures.push('平台模块表与 PLATFORM_EXTERNALS 不一致: [' + fromConfig.join(', ') + '] vs [' + [...PLATFORM_MODULES].sort().join(', ') + ']')
      }
    }
  }

  // 3. 沙箱执行:不得泄漏 module/exports 到页面全局,导出需带入口字段
  const sandbox = { window: {} }
  sandbox.window.__ModuleLoader__ = {
    load: (definition) => {
      sandbox.__loaded = definition
      // 工厂只跑一次:带副作用的 bundle 重复执行会掩盖首次执行的真实结果
      sandbox.__exports = definition.factory(() => ({}))
      return sandbox.__exports
    },
  }
  const context = createContext(sandbox)
  runInContext(text, context, { filename: file })
  if (context.module !== undefined) failures.push('沙箱执行后出现全局 module')
  if (context.exports !== undefined) failures.push('沙箱执行后出现全局 exports')
  if (sandbox.window.module !== undefined) failures.push('沙箱执行后出现 window.module')
  if (sandbox.window.exports !== undefined) failures.push('沙箱执行后出现 window.exports')
  const loaded = sandbox.__loaded
  if (loaded === undefined) failures.push('__ModuleLoader__.load 未被调用')
  else {
    const exported = sandbox.__exports
    for (const field of ['name', 'inject', 'apply']) {
      if (exported === undefined || exported[field] === undefined) failures.push('客户端导出缺少 ' + field)
    }
  }

  console.log('客户端产物校验: ' + file + ' require ' + required.length + ' 项,结构断言 ' +
    (failures.length === 0 ? '通过' : failures.length + ' 处失败'))
}

if (failures.length > 0) {
  for (const item of failures) console.log('  ' + item)
  process.exitCode = 1
}
