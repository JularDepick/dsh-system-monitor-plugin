/*
 * 语法验证(不构建、不解析依赖)
 *
 * 用 TypeScript 编译器 API 的 transpileModule 只做语法/词法解析并报告语法诊断,
 * 不做类型解析、不读 tsconfig、不解析 import(target)。
 * 覆盖 src/ 下全部 .ts/.tsx、脚本目录下的 .mjs/.cjs、根目录的 tsdown.config.ts,
 * 以及 package.json/tsconfig.json 的 JSON 解析与翻译文件的结构与一致性检查。
 *
 * 翻译检查是规范里提到的「本地检查」的落地点,覆盖:
 * 目录扫描发现全部 ini、[meta] 四键与版本号/语言/时间格式、重复键、
 * 三份 ini 的键集与占位符、两套字典与 ini 的双向键集与占位符、
 * 界面实际用到的字面键是否都有词条,以及英文侧不得出现中日韩字符。
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname, resolve, dirname, basename } from 'node:path'
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

// 翻译文件:目录扫描 + 结构 + 版本号 + 重复键
const iniDir = join(root, 'src/translation')
const iniNames = existsSync(iniDir) ? readdirSync(iniDir).filter((name) => name.endsWith('.ini')).sort() : []
if (iniNames.length === 0) failures.push('src/translation  未发现任何 .ini')

const packVersion = manifests['package.json']?.version
const expectedFor = typeof packVersion === 'string' ? 'v' + packVersion : null
// 英文侧禁用字符集: 中日韩文字, 以及全角标点区(、。「」 与 ，：；（） 等)
const CJK = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/

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
