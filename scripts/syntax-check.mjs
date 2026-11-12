/*
 * 语法验证(不构建、不解析依赖)
 *
 * 用 TypeScript 编译器 API 的 transpileModule 只做语法/词法解析并报告语法诊断,
 * 不做类型解析、不读 tsconfig、不解析 import(target)。
 * 覆盖 src/ 下全部 .ts/.tsx、脚本目录下的 .mjs/.cjs、根目录的 tsdown.config.ts,
 * 以及 package.json/tsconfig.json 的 JSON 解析、打包面一致性(入口路径、版本号、
 * engines.dsh 与 dsh 前缀 peer 同值、patch 引用、files 白名单)与翻译文件的
 * 结构与一致性检查。
 *
 * 翻译检查是规范里提到的「本地检查」的落地点,覆盖:
 * 目录扫描发现全部 ini、[meta] 四键与版本号/语言/时间格式、重复键、
 * 三份 ini 的键集与占位符、两套字典与 ini 的双向键集与占位符、
 * 界面实际用到的字面键是否都有词条、调用点传入的变量与模板占位符是否对得上、
 * 词条是否确实被界面或标签引用(死键),以及英文侧不得出现中日韩字符。
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    // 跳过临时目录:其中的解包产物与脚本草稿不属于项目源码
    if (name === 'tmp' || name === 'node_modules') continue
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function readUtf8(relative) {
  const full = join(root, relative)
  if (!existsSync(full)) {
    failures.push(relative + '  文件缺失')
    return null
  }
  return readFileSync(full, 'utf8')
}

const targets = []
// 只扫项目源码与脚本目录: .agents 是本地草稿目录(已被 git 忽略),其中的临时脚本不影响项目产物
for (const dir of ['src', 'scripts']) {
  const full = join(root, dir)
  if (existsSync(full)) targets.push(...walk(full))
}
for (const file of ['tsdown.config.ts']) {
  const full = join(root, file)
  if (existsSync(full)) targets.push(full)
}

let checked = 0
const failures = []

for (const file of targets) {
  const ext = extname(file)
  if (!['.ts', '.tsx', '.mjs', '.cjs', '.js'].includes(ext)) continue
  // 类型声明副本只由 tsc 消费,transpileModule 对其无产出(第三方 .d.ts 会直接失败),按头部声明跳过
  if (/\.d\.(ts|mts|cts)$/.test(file)) continue
  const text = readFileSync(file, 'utf8')
  const kind = ext === '.tsx' ? ts.ScriptKind.TSX : ext === '.ts' ? ts.ScriptKind.TS : ts.ScriptKind.JS
  const result = ts.transpileModule(text, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      allowJs: true,
    },
  })
  checked += 1
  for (const d of result.diagnostics ?? []) {
    const pos = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : null
    const where = pos ? file + ':' + (pos.line + 1) + ':' + (pos.character + 1) : file
    failures.push(where + '  TS' + d.code + '  ' + ts.flattenDiagnosticMessageText(d.messageText, ' '))
  }
}

// JSON 清单
const manifests = {}
for (const file of ['package.json', 'tsconfig.json']) {
  const text = readUtf8(file)
  if (text === null) continue
  try {
    manifests[file] = JSON.parse(text)
    checked += 1
  } catch (error) {
    failures.push(file + '  JSON 解析失败: ' + error.message)
  }
}

// manifest 与实装一致性: 入口路径, 版本号, 兼容区间, 依赖分区与 patch 引用
{
  const pkg = manifests['package.json']
  if (pkg === undefined) {
    failures.push('package.json  缺失或无法解析, 打包面校验跳过')
  } else {
    checked += 1
    const exportsField = pkg.exports ?? {}
    const clientExport = exportsField['./client']
    const clientFile = typeof clientExport === 'string' ? clientExport : clientExport?.default
    const patchPath = pkg.dsh?.bundle?.patch
    if (typeof patchPath !== 'string') {
      failures.push('package.json  dsh.bundle.patch 缺失')
    } else if (!existsSync(join(root, patchPath))) {
      failures.push('package.json  dsh.bundle.patch 指向的文件不存在: ' + patchPath)
    } else if (!readFileSync(join(root, patchPath), 'utf8').includes('name: ' + pkg.name)) {
      failures.push(patchPath + '  未以包名 ' + pkg.name + ' 插入插件行')
    }
    // 宿主只组合 platform 为 web 的 dsh.client 声明, 写错等于客户端半身不加载
    if (pkg.dsh?.client?.platform !== 'web') {
      failures.push('package.json  dsh.client.platform 应为 web')
    }
    // 依赖分区: 同一包不得既进 dependencies 又进 peer, dsh 前缀包由宿主提供, 只能作 peer
    const deps = pkg.dependencies ?? {}
    const peers = pkg.peerDependencies ?? {}
    for (const depName of Object.keys(deps)) {
      if (Object.hasOwn(peers, depName)) failures.push('package.json  ' + depName + ' 同时出现在 dependencies 与 peerDependencies')
      if (depName === '@deepseek-ai/dsh' || depName.startsWith('@deepseek-ai/dsh-')) {
        failures.push('package.json  ' + depName + ' 属宿主提供的 dsh 包, 应为 peer + dev 而非 dependencies')
      }
    }
    // engines.dsh 与 dsh 前缀 peer 必须同值: 任一处漏改都会让兼容性判定口径分裂
    const enginesDsh = pkg.engines?.dsh
    const peerDsh = pkg.peerDependencies?.['@deepseek-ai/dsh-tools']
    if (typeof enginesDsh !== 'string' || enginesDsh !== peerDsh) {
      failures.push('package.json  engines.dsh [' + String(enginesDsh) + '] 与 @deepseek-ai/dsh-tools 的 peer [' + String(peerDsh) + '] 不同值')
    }
    // 面板页脚的版本号取常量, 必须与 manifest 同值
    const constantText = readUtf8('src/constants.ts')
    const pluginVersion = constantText === null ? null : /export const PLUGIN_VERSION = '([^']+)'/.exec(constantText)
    if (pluginVersion === null) failures.push('src/constants.ts  未找到 PLUGIN_VERSION')
    else if (pluginVersion[1] !== pkg.version) {
      failures.push('src/constants.ts  PLUGIN_VERSION=' + pluginVersion[1] + ' 与 package.json 的 ' + String(pkg.version) + ' 不一致')
    }
    // 入口与 files 白名单要有实体; dist/ 不存在(未构建)时跳过, 与 check-client-bundle 同口径
    if (!existsSync(join(root, 'dist'))) {
      console.log('打包面校验: 未找到 dist/(先构建再校验), 入口与 files 白名单本次跳过')
    } else {
      const entries = [
        ['main', pkg.main],
        ['types', pkg.types],
        ['exports["."].types', exportsField['.']?.types],
        ['exports["."].default', exportsField['.']?.default],
        ['exports["./client"].default', clientFile],
      ]
      for (const [label, entry] of entries) {
        if (typeof entry !== 'string') failures.push('package.json  ' + label + ' 缺失')
        else if (!existsSync(join(root, entry))) failures.push('package.json  ' + label + ' 指向的文件不存在: ' + entry)
      }
      for (const item of pkg.files ?? []) {
        if (!item.includes('*')) {
          if (!existsSync(join(root, item))) failures.push('package.json  files 项不存在: ' + item)
          continue
        }
        const star = item.indexOf('*')
        const prefix = item.slice(0, star)
        const slash = prefix.lastIndexOf('/')
        const dir = join(root, slash < 0 ? '.' : prefix.slice(0, slash))
        const namePrefix = slash < 0 ? prefix : prefix.slice(slash + 1)
        const suffix = item.slice(star + 1)
        const hit = existsSync(dir) && readdirSync(dir).some((name) => name.startsWith(namePrefix) && name.endsWith(suffix))
        if (!hit) failures.push('package.json  files 项无匹配文件: ' + item)
      }
    }
  }
}

// 翻译文件:目录扫描 + 结构 + 版本号 + 重复键
const iniDir = join(root, 'src/translation')
const iniNames = existsSync(iniDir) ? readdirSync(iniDir).filter((name) => name.endsWith('.ini')).sort() : []
if (iniNames.length === 0) failures.push('src/translation  未发现任何 .ini')

const packVersion = manifests['package.json']?.version
const expectedFor = typeof packVersion === 'string' ? 'v' + packVersion : null
// 英文侧禁用字符集: 中日韩文字, 全角标点区(、。「」 与 ，：；（） 等),
// 以及通用标点区的弯引号与间隔号(规范明确不用的 ‘’“” 与 ·, 它们不在上面两个区间里)
const CJK = /[\u00b7\u2018-\u201d\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/

function parseIni(name) {
  const text = readFileSync(join(iniDir, name), 'utf8')
  const result = { meta: new Map(), entries: new Map(), duplicates: [], text }
  if (text.charCodeAt(0) === 0xfeff) failures.push(name + '  文件带 BOM')
  let section = ''
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.length === 0) continue
    if (line.startsWith(';') || line.startsWith('#')) {
      failures.push(name + '  含注释行(规范要求 ini 不含注释)')
      continue
    }
    const header = /^\[(.+)\]$/.exec(line)
    if (header !== null) {
      section = header[1]
      continue
    }
    const index = line.indexOf('=')
    if (index <= 0) {
      failures.push(name + '  无法解析的行: ' + line.slice(0, 40))
      continue
    }
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim()
    const target = section === 'meta' ? result.meta : result.entries
    if (target.has(key)) result.duplicates.push(key)
    target.set(key, value)
  }
  for (const key of result.duplicates) failures.push(name + '  重复键: ' + key)
  return result
}

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

const iniByLang = new Map()
for (const name of iniNames) {
  checked += 1
  const ini = parseIni(name)
  const isExample = name.startsWith('.')
  const lang = isExample ? name.slice('.example_'.length, -'.ini'.length) : name.slice(0, -'.ini'.length)
  iniByLang.set(lang, ini)
  for (const key of ['for', 'lang', 'name', 'endtime']) {
    if (!ini.meta.has(key)) failures.push(name + '  [meta] 缺少键 ' + key)
  }
  if (ini.meta.get('lang') !== lang) failures.push(name + '  [meta] lang 与文件名不符(期望 ' + lang + ')')
  if (expectedFor !== null && ini.meta.get('for') !== expectedFor) {
    failures.push(name + '  [meta] for=' + String(ini.meta.get('for')) + ' 与 package.json 版本不符(期望 ' + expectedFor + ')')
  }
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(String(ini.meta.get('endtime')))) {
    failures.push(name + '  [meta] endtime 不符合 yyyy-MM-dd HH:mm:ss+HH:mm')
  }
  if (ini.entries.size === 0) failures.push(name + '  [translation] 无词条')
  for (const [key, value] of ini.entries) {
    if (value.length === 0) failures.push(name + '  ' + key + ' 取值为空')
    if (lang.startsWith('en') && CJK.test(value)) failures.push(name + '  ' + key + ' 含中日韩或全角字符(英文文件不应出现)')
  }
}

// 三份 ini 之间的键集、占位符与模板一致性
const baseName = 'zh-CN'
const baseIni = iniByLang.get(baseName)
if (baseIni !== undefined) {
  for (const [lang, ini] of iniByLang) {
    if (lang === baseName) continue
    compareTranslations(iniNames.find((n) => n.includes(lang)) ?? lang, baseIni.entries, ini.entries)
  }
  const example = iniNames.find((name) => name.startsWith('.example_'))
  if (example === undefined) {
    failures.push('src/translation  缺少 .example 模板')
  } else {
    const exampleIni = parseIni(example)
    if (exampleIni.text !== baseIni.text) failures.push(example + '  与 zh-CN.ini 内容不一致(模板须逐字节相同)')
  }
}

function compareTranslations(label, expected, actual, options = {}) {
  for (const key of expected.keys()) if (!actual.has(key)) failures.push(label + '  缺少词条: ' + key)
  for (const key of actual.keys()) if (!expected.has(key)) failures.push(label + '  多出词条: ' + key)
  for (const [key, value] of expected) {
    const other = actual.get(key)
    if (other === undefined) continue
    if (placeholders(value) !== placeholders(other)) {
      failures.push(key + '  占位符不一致(' + label + '): [' + placeholders(value) + '] vs [' + placeholders(other) + ']')
    }
    // 同语言的两份数据(ini 与字典)必须逐字相同: 只比键集与占位符会漏掉取值漂移
    if (options.sameText === true && value !== other) {
      failures.push(key + '  取值不一致(' + label + '): [' + value + '] vs [' + other + ']')
    }
  }
}

// 两套字典与 ini 的双向一致性
{
  const source = readUtf8('src/client/i18n.ts')
  if (source !== null) {
    const zhStart = source.indexOf('const zhDictionary')
    const enStart = source.indexOf('const enDictionary')
    if (zhStart < 0 || enStart < 0) {
      failures.push('src/client/i18n.ts  未找到 zhDictionary / enDictionary')
    } else {
      checked += 1
      const dictOf = (text) => {
        const map = new Map()
        const re = /'([a-z][A-Za-z0-9.]*)':\s*'((?:[^'\\]|\\.)*)'/g
        let match
        while ((match = re.exec(text)) !== null) map.set(match[1], match[2])
        return map
      }
      const dicts = { 'zh-CN': dictOf(source.slice(zhStart, enStart)), 'en-US': dictOf(source.slice(enStart)) }
      for (const [key, value] of dicts['en-US']) {
        if (value.length === 0) failures.push('i18n.ts(en-US)  ' + key + ' 取值为空')
        if (CJK.test(value)) failures.push('i18n.ts(en-US)  ' + key + ' 含中日韩或全角字符')
      }
      compareTranslations('i18n.ts(zh-CN) vs en-US', dicts['zh-CN'], dicts['en-US'])
      for (const [lang, dict] of Object.entries(dicts)) {
        const ini = iniByLang.get(lang)
        if (ini === undefined) {
          failures.push('src/translation  缺少 ' + lang + '.ini')
          continue
        }
        compareTranslations('i18n.ts(' + lang + ') vs ' + lang + '.ini', ini.entries, dict, { sameText: true })
      }
      // 界面实际用到的字面键必须有词条(动态键经映射表,另行人工核对)
      const client = readUtf8('src/client/index.tsx')
      if (client !== null) {
        const used = new Set([
          ...[...client.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1]),
          // 标签 thunk 走 translate('...') 取词条,同样要扫
          ...[...client.matchAll(/\btranslate\(\s*'([^']+)'/g)].map((m) => m[1]),
        ])
        for (const key of used) {
          if (!dicts['zh-CN'].has(key)) failures.push('index.tsx 用到未定义的键: ' + key)
        }
        // 调用点传参必须与模板占位符一一对应: 只比 ini 与字典会漏掉「模板有 {name} 却没传」
        // 与「传了多余变量」这两类漂移(渲染时会原样留下花括号或忽略参数)
        for (const call of client.matchAll(/\b(?:t|translate)\(\s*'([^']+)'\s*(?:,\s*(\{[^{}]*\}))?\s*\)/g)) {
          const template = dicts['zh-CN'].get(call[1])
          if (template === undefined) continue
          const expected = placeholders(template)
          // 只取对象字面量的键名(冒号前或简写),不取右侧表达式里的标识符
          const passed = call[2] === undefined
            ? ''
            : [...new Set(call[2].slice(1, -1).split(',').map((entry) => entry.split(':')[0].trim()).filter((name) => /^[A-Za-z_$][\w$]*$/.test(name)))].sort().join(',')
          if (expected !== passed) {
            failures.push('index.tsx  ' + call[1] + ' 调用点传参与占位符不符: [' + passed + '] vs [' + expected + ']')
          }
        }
        // 死键: 词条必须在界面源码里被引用(动态键的取值也是字面量,仍能命中)
        const corpus = walk(join(root, 'src'))
          .filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(join('client', 'i18n.ts')))
          .map((file) => readFileSync(file, 'utf8'))
          .join('\n')
        for (const key of dicts['zh-CN'].keys()) {
          if (!corpus.includes("'" + key + "'") && !corpus.includes('"' + key + '"')) {
            failures.push('i18n.ts  ' + key + ' 未被界面引用(死键)')
          }
        }
        checked += 1
      }
    }
  }
}

console.log('语法验证:检查 ' + checked + ' 个文件')
if (failures.length === 0) {
  console.log('结果:通过,无语法错误')
} else {
  console.log('结果:' + failures.length + ' 处问题')
  for (const f of failures) console.log('  ' + f)
  process.exitCode = 1
}
