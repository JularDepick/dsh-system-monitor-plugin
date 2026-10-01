/*
 * 语法验证(不构建、不解析依赖)
 *
 * 用 TypeScript 编译器 API 的 transpileModule 只做语法/词法解析并报告语法诊断,
 * 不做类型解析、不读 tsconfig、不解析 import(target)。
 * 覆盖 src/ 下全部 .ts/.tsx、scripts/ 下 .cjs、.agents/ 下 .mjs,
 * 以及 package.json/tsconfig.json 的 JSON 解析与翻译 ini 的结构检查。
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const targets = []
for (const dir of ['src', 'scripts', '.agents']) {
  const full = join(root, dir)
  if (existsSync(full)) targets.push(...walk(full))
}

let checked = 0
const failures = []

for (const file of targets) {
  const ext = extname(file)
  if (!['.ts', '.tsx', '.mjs', '.cjs', '.js'].includes(ext)) continue
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
    const where = pos ? `${file}:${pos.line + 1}:${pos.character + 1}` : file
    failures.push(`${where}  TS${d.code}  ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`)
  }
}

// JSON 清单
for (const file of ['package.json', 'tsconfig.json']) {
  const full = join(root, file)
  try {
    JSON.parse(readFileSync(full, 'utf8'))
    checked += 1
  } catch (error) {
    failures.push(`${file}  JSON 解析失败: ${error.message}`)
  }
}

// 翻译 ini:两个节存在、[meta] 四键齐全、[translation] 至少一条
const iniExpected = {
  'src/translation/.example_zh-CN.ini': 'zh-CN',
  'src/translation/zh-CN.ini': 'zh-CN',
  'src/translation/en-US.ini': 'en-US',
}
for (const [file, lang] of Object.entries(iniExpected)) {
  const text = readFileSync(join(root, file), 'utf8')
  checked += 1
  const meta = /\[meta\]([\s\S]*?)(?=\n\[|$)/.exec(text)
  const body = /\[translation\]([\s\S]*)$/.exec(text)
  if (!meta) failures.push(`${file}  缺少 [meta] 节`)
  if (!body) failures.push(`${file}  缺少 [translation] 节`)
  if (meta) {
    for (const key of ['for', 'lang', 'name', 'endtime']) {
      if (!new RegExp(`^${key}=`, 'm').test(meta[1])) failures.push(`${file}  [meta] 缺少键 ${key}`)
    }
    if (!new RegExp(`^lang=${lang}$`, 'm').test(meta[1])) failures.push(`${file}  lang 与文件名不符(期望 ${lang})`)
    if (!/^endtime=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/m.test(meta[1])) {
      failures.push(`${file}  endtime 不符合 yyyy-MM-dd HH:mm:ss+HH:mm`)
    }
  }
  if (body) {
    const keys = body[1].split('\n').map((l) => l.trim()).filter((l) => l.includes('='))
    if (keys.length === 0) failures.push(`${file}  [translation] 无词条`)
  }
}

console.log(`语法验证:检查 ${checked} 个文件`)
if (failures.length === 0) {
  console.log('结果:通过,无语法错误')
} else {
  console.log(`结果:${failures.length} 处问题`)
  for (const f of failures) console.log('  ' + f)
  process.exitCode = 1
}
