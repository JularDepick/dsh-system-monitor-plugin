/*
 * pack 后置脚本:把本次 pack 产出的 tarball 移动进 release/ 目录
 *
 * 由 package.json 的 postpack 钩子调用;构建产物与 tarball 统一
 * 存放于 release/(发布物隔离,目录已被 .gitignore 忽略)。
 * 作者:JularDepick
 */

const fs = require('node:fs')
const path = require('node:path')

const rootDir = path.join(__dirname, '..')
const releaseDir = path.join(rootDir, 'release')
fs.mkdirSync(releaseDir, { recursive: true })

// 只搬本次 pack 产出的那一个 tarball:仓库根若留有别的 tgz(其它项目或历史版本),
// 一并搬进 release/ 会让发布目录混入无关包
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
const expected = `${pkg.name}-${pkg.version}.tgz`

let moved = 0
for (const entry of fs.readdirSync(rootDir)) {
  if (!entry.endsWith('.tgz')) continue
  if (entry !== expected) {
    console.log(`postpack: skipped ${entry}(不是本次产物, 预期 ${expected})`)
    continue
  }
  fs.renameSync(path.join(rootDir, entry), path.join(releaseDir, entry))
  moved += 1
  console.log(`postpack: ${entry} -> release/`)
}
if (moved === 0) console.log(`postpack: no ${expected} in root to move`)