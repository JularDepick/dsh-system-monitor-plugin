/*
 * pack 后置脚本:把本次 pack 产出的 tarball 移动进 release/ 目录
 *
 * 由 package.json 的 postpack 钩子调用;构建产物与 tarball 统一
 * 存放于 release/(发布物隔离,目录已被 .gitignore 忽略)。
 * 作者:JularDepick
 */

const fs = require('node:fs')
const path = require('node:path')

const releaseDir = path.join(__dirname, '..', 'release')
const rootDir = path.join(__dirname, '..')
fs.mkdirSync(releaseDir, { recursive: true })

let moved = 0
for (const entry of fs.readdirSync(rootDir)) {
  if (!entry.endsWith('.tgz')) continue
  const from = path.join(rootDir, entry)
  const to = path.join(releaseDir, entry)
  fs.renameSync(from, to)
  moved += 1
  console.log(`postpack: ${entry} -> release/`)
}
if (moved === 0) console.log('postpack: no tarball in root to move')