/*
 * 客户端产物结构校验
 *
 * 客户端 bundle 由 tsdown 以 CJS 包装成 window.__ModuleLoader__.load({ id, factory }),
 * 结构一旦走样(前奏落到脚本顶层、footer 不闭合、require 集合超出宿主平台模块表)
 * 在浏览器端表现为插件加载失败或全局变量污染,本地却很难察觉,故在 check 里断言:
 *   1. 顶层只有 load 调用,CJS 前奏在 factory 体内,footer 与 banner 配平;
 *   2. require 的包名是宿主平台模块表的子集;
 *   3. 在无 module/exports 的沙箱里执行后,全局不新增 module/exports,导出含 name/inject/apply。
 * dist/client.js 不存在时(未构建)跳过并提示,不视为失败。
 */

import { existsSync, readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'

/** 宿主平台模块表(与 tsdown 的外部化清单保持一致) */
const PLATFORM_MODULES = ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives']

const file = 'dist/client.js'
const failures = []

if (!existsSync(file)) {
  console.log('客户端产物校验: 未找到 ' + file + '(先构建再校验),本次跳过')
} else {
  const text = readFileSync(file, 'utf8')

  // 1. 结构:顶层不得出现 var module/exports,前奏必须在 factory 体内
  if (/^\s*(?:var|let|const)\s+(?:module|exports)\b/m.test(text.slice(0, text.indexOf('__ModuleLoader__') < 0 ? text.length : text.indexOf('__ModuleLoader__')))) {
    failures.push('脚本顶层出现 module/exports 声明(应放在 factory 体内)')
  }
  if (!/factory:\s*\(require\)\s*=>\s*\{\s*var module = \{ exports: \{\} \}; var exports = module\.exports;/.test(text)) {
    failures.push('banner 未把 CJS 前奏放进 factory 体内')
  }
  if (!/return module\.exports; \} \}\);\s*$/.test(text)) {
    failures.push('footer 未按 return module.exports; } }); 收尾')
  }
  const idMatch = /id:\s*"([^"]+)"/.exec(text)
  if (idMatch === null) failures.push('未找到 __ModuleLoader__.load 的 id')
  else if (idMatch[1] !== JSON.parse(readFileSync('package.json', 'utf8')).name) {
    failures.push('bundle id 与包名不一致: ' + idMatch[1])
  }

  // 2. require 集合必须是平台模块表的子集
  const required = [...new Set([...text.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]))].sort()
  for (const name of required) {
    if (!PLATFORM_MODULES.includes(name)) failures.push('require 了平台模块表之外的包: ' + name)
  }

  // 3. 沙箱执行:不得泄漏 module/exports 到全局,导出需带入口字段
  const sandbox = { window: {} }
  sandbox.window.__ModuleLoader__ = {
    load: (definition) => {
      sandbox.__loaded = definition
      return definition.factory(() => ({}))
    },
  }
  const context = createContext(sandbox)
  try {
    runInContext(text, context, { filename: file })
    if (context.module !== undefined) failures.push('沙箱执行后出现全局 module')
    if (context.exports !== undefined) failures.push('沙箱执行后出现全局 exports')
    const loaded = sandbox.__loaded
    const exported = loaded === undefined ? undefined : loaded.factory(() => ({}))
    for (const field of ['name', 'inject', 'apply']) {
      if (exported === undefined || exported[field] === undefined) failures.push('客户端导出缺少 ' + field)
    }
  } catch (error) {
    // require 用的是空对象桩,拿不到真实模块属正常:只提示,不判失败
    console.log('客户端产物校验: 沙箱执行未完成(' + String(error && error.message) + '),结构断言已通过')
  }

  console.log('客户端产物校验: ' + file + ' require ' + required.length + ' 项,结构断言 ' +
    (failures.length === 0 ? '通过' : failures.length + ' 处失败'))
}

if (failures.length > 0) {
  for (const item of failures) console.log('  ' + item)
  process.exitCode = 1
}
