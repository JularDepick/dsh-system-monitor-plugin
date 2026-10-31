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

// npm/pnpm publish 的 tarball 生成在临时目录而不是包根:此时不归位,也不视为失败,
// 否则发布流程会被本脚本的退出码打断
if (process.env.npm_command === 'publish') {
  console.log('postpack: publish 由包管理器自行打包,跳过 release/ 归位')
  process.exit(0)
}

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
if (moved === 0) {
  // 归位失败属打包链路故障(常见原因:版本号漏改导致包名与预期不一致),
  // 必须以非 0 退出让打包失败可见,否则 release/ 空着也算「成功」
  console.error(`postpack: 未找到本次产物 ${expected}, release/ 未更新`)
  process.exitCode = 1
}