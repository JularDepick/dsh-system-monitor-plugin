#!/usr/bin/env node
/*
 * 官方文档收录校验(只读)
 *
 * 用途:核对 docs/dsh-dev-docs/ 下已收录的官方插件开发文档与官方仓库同版本目录是否一致,
 * 供版本升级时判断需要补收或更新哪些文件。默认 dry-run:只报告差异,不写任何文件
 * (收录与覆盖是人工决策,脚本不代替决策,也不做网络重试之外的任何自动修复)。
 *
 * 用法:
 *   node scripts/check-official-docs.mjs                 # 校验全部已收录版本(含内容比对)
 *   node scripts/check-official-docs.mjs --paths-only    # 只比对文件清单,不拉取内容
 *   node scripts/check-official-docs.mjs --version 0.2.0-rc.2 --tag v0.2.0-rc.2
 *
 * 退出码:0 一致;1 存在差异;2 网络或参数问题(无法判定)。
 *
 * 镜像与自建源:经环境变量覆盖,无需改动脚本
 *   DSH_DOCS_API_BASE  默认 https://api.github.com
 *   DSH_DOCS_RAW_BASE  默认 https://raw.githubusercontent.com
 *   DSH_DOCS_TOKEN     访问令牌(官方文档源仓库为私有仓库时必需;未授权访问返回 404)
 * 作者:JularDepick
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

/** 官方仓库坐标(插件开发文档所在仓库与目录) */
const OFFICIAL_REPO = 'deepseek-ai/deepseek-harness'
const OFFICIAL_DOCS_DIR = 'docs/user/develop'

/** 本地收录根目录(相对工作目录) */
const LOCAL_ROOT = join('docs', 'dsh-dev-docs')

const apiBase = process.env.DSH_DOCS_API_BASE ?? 'https://api.github.com'
const rawBase = process.env.DSH_DOCS_RAW_BASE ?? 'https://raw.githubusercontent.com'
const token = process.env.DSH_DOCS_TOKEN ?? ''

/** 请求头:有令牌时带上授权(私有仓库必需) */
function headers(accept) {
  return token.length === 0 ? { accept } : { accept, authorization: `Bearer ${token}` }
}

/** 解析命令行参数(未知参数直接报错退出,避免静默按默认值跑) */
function parseArgs(argv) {
  const options = { version: null, tag: null, pathsOnly: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--paths-only') options.pathsOnly = true
    else if (arg === '--version') options.version = argv[++i] ?? null
    else if (arg === '--tag') options.tag = argv[++i] ?? null
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`未知参数: ${arg}`)
  }
  return options
}

/** 递归列出目录下的文件(相对给定根目录,统一用 / 分隔) */
function listFiles(root) {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else files.push(relative(root, full).split(sep).join('/'))
    }
  }
  walk(root)
  return files.sort()
}

/** 规范化文本内容(统一换行,忽略末尾空行差异) */
function normalize(text) {
  return text.replace(/\r\n/g, '\n').replace(/\s+$/, '')
}

/** 内容指纹(用于差异报告里给出可核对的值) */
function fingerprint(text) {
  return createHash('sha256').update(normalize(text)).digest('hex').slice(0, 12)
}

/** 拉取官方仓库某版本的文件清单(单次请求取整棵树) */
async function fetchOfficialPaths(tag) {
  const url = `${apiBase}/repos/${OFFICIAL_REPO}/git/trees/${encodeURIComponent(tag)}?recursive=1`
  const response = await fetch(url, { headers: headers('application/vnd.github+json') })
  if (!response.ok) throw new Error(`官方清单请求失败 ${response.status} ${url}`)
  const payload = await response.json()
  const entries = Array.isArray(payload?.tree) ? payload.tree : []
  const prefix = `${OFFICIAL_DOCS_DIR}/`
  return entries
    .filter((entry) => entry?.type === 'blob' && typeof entry.path === 'string' && entry.path.startsWith(prefix))
    .map((entry) => entry.path.slice(prefix.length))
    .sort()
}

/**
 * 拉取官方单个文件内容(文本)。
 * 有令牌时走 API 的内容接口(私有仓库可用),否则走原始内容地址(公开仓库与镜像)。
 */
async function fetchOfficialText(tag, path) {
  const encoded = path.split('/').map((segment) => encodeURIComponent(segment)).join('/')
  const url = token.length === 0
    ? `${rawBase}/${OFFICIAL_REPO}/${encodeURIComponent(tag)}/${OFFICIAL_DOCS_DIR}/${encoded}`
    : `${apiBase}/repos/${OFFICIAL_REPO}/contents/${OFFICIAL_DOCS_DIR}/${encoded}?ref=${encodeURIComponent(tag)}`
  const response = await fetch(url, token.length === 0 ? {} : { headers: headers('application/vnd.github.raw') })
  if (!response.ok) throw new Error(`官方文件请求失败 ${response.status} ${path}`)
  return response.text()
}

/** 比较两个文件清单,返回仅在某一侧出现的路径 */
function diffPaths(local, official) {
  const localSet = new Set(local)
  const officialSet = new Set(official)
  return {
    missing: official.filter((path) => !localSet.has(path)),
    extra: local.filter((path) => !officialSet.has(path)),
  }
}

/** 校验单个版本目录 */
async function checkVersion(version, options) {
  const localDir = resolve(LOCAL_ROOT, `dsh-${version}`)
  if (!existsSync(localDir)) {
    console.log(`跳过 ${version}: 本地目录不存在 ${relative(process.cwd(), localDir)}`)
    return { version, status: 'skipped', differences: 0 }
  }
  const tag = options.tag ?? version
  console.log(`\n=== ${version}(官方 tag: ${tag}) ===`)
  const local = listFiles(localDir)
  const official = await fetchOfficialPaths(tag)
  console.log(`本地 ${local.length} 个文件,官方 ${official.length} 个文件`)
  const { missing, extra } = diffPaths(local, official)
  let differences = 0
  for (const path of missing) {
    console.log(`  缺收: ${path}`)
    differences += 1
  }
  for (const path of extra) {
    console.log(`  多出(官方已删除或改名): ${path}`)
    differences += 1
  }
  if (options.pathsOnly) {
    console.log(differences === 0 ? '清单一致(未比对内容)' : `清单差异 ${differences} 项(未比对内容)`)
    return { version, status: differences === 0 ? 'in-sync' : 'differs', differences }
  }
  const shared = local.filter((path) => official.includes(path))
  for (const path of shared) {
    const localText = readFileSync(join(localDir, path), 'utf8')
    const officialText = await fetchOfficialText(tag, path)
    if (normalize(localText) !== normalize(officialText)) {
      console.log(`  内容不同: ${path}(本地 ${fingerprint(localText)} / 官方 ${fingerprint(officialText)})`)
      differences += 1
    }
  }
  console.log(differences === 0 ? '与官方一致' : `差异合计 ${differences} 项`)
  return { version, status: differences === 0 ? 'in-sync' : 'differs', differences }
}

/** 用法说明(--help 输出,与文件头注释同源口径) */
const USAGE = [
  '官方文档收录校验(只读 dry-run)',
  '',
  '用法:',
  '  node scripts/check-official-docs.mjs                 # 校验全部已收录版本(含内容比对)',
  '  node scripts/check-official-docs.mjs --paths-only    # 只比对文件清单,不拉取内容',
  '  node scripts/check-official-docs.mjs --version 0.2.0-rc.2 --tag v0.2.0-rc.2',
  '',
  '退出码: 0 一致;1 存在差异;2 网络或参数问题(无法判定)',
  '镜像: DSH_DOCS_API_BASE 与 DSH_DOCS_RAW_BASE 可覆盖默认源',
].join('\n')

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(USAGE)
    return 0
  }
  const rootDir = resolve(LOCAL_ROOT)
  if (!existsSync(rootDir)) {
    console.log(`收录目录不存在: ${LOCAL_ROOT}(无需校验)`)
    return 0
  }
  const versions = options.version === null
    ? readdirSync(rootDir).filter((name) => name.startsWith('dsh-')).map((name) => name.slice(4)).sort()
    : [options.version]
  if (versions.length === 0) {
    console.log('没有已收录的版本目录,无需校验')
    return 0
  }
  let differs = 0
  for (const version of versions) {
    const result = await checkVersion(version, options)
    if (result.status === 'differs') differs += 1
  }
  console.log(`\n结论: ${differs === 0 ? '全部一致' : `${differs} 个版本存在差异`}(本次为只读校验,未改动任何文件)`)
  return differs === 0 ? 0 : 1
}

try {
  process.exitCode = await main()
} catch (error) {
  console.error(`校验无法完成: ${error instanceof Error ? error.message : String(error)}`)
  console.error('说明: 官方文档源仓库为私有仓库,未授权访问返回 404;可设置 DSH_DOCS_TOKEN 后重试,')
  console.error('      或把 DSH_DOCS_API_BASE 与 DSH_DOCS_RAW_BASE 指向已授权的镜像/自建源')
  process.exitCode = 2
}
