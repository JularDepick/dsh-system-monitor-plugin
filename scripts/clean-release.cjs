/*
 * 打包后置清理:删除 release/ 里的历史同包 tarball,保证只留本次产物
 *
 * 与 pack-to-release.cjs 一起由 postpack 钩子按序调用(先清理再归位),
 * 刻意不挂在 prepack:早于构建删除会把上一份可用产物一并丢掉,
 * 构建或打包失败时就没有可回退的包;也只删本包的 tgz,
 * release/ 里其它文件(校验和、说明等)不受影响。
 * publish 路径同样跳过:那时 tarball 由包管理器在临时目录生成,本脚本
 * 删掉的旧产物不会被新的补上,release/ 会空着。
 * 作者:JularDepick
 */

const fs = require('node:fs')
const path = require('node:path')

// publish 不经过仓库根目录产出 tarball,此时清理只会删掉上一份可用产物
if (process.env.npm_command === 'publish') {
  console.log('clean-release: publish 不在仓库根产出 tarball,跳过清理')
  process.exit(0)
}

const rootDir = path.join(__dirname, '..')
const releaseDir = path.join(rootDir, 'release')
if (!fs.existsSync(releaseDir)) process.exit(0)

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
const expected = `${pkg.name}-${pkg.version}.tgz`
// 按「包名前缀 + .tgz 结尾」识别本包的历史产物,不用正则拼装(包名里的 . 与 @ 容易转义出错)
const prefix = `${pkg.name}-`

let removed = 0
for (const entry of fs.readdirSync(releaseDir)) {
  if (entry === expected) continue
  if (!entry.startsWith(prefix) || !entry.endsWith('.tgz')) continue
  // 前缀后必须是版本号段,避免误删同前缀的其它产物(如手工放置的同名说明包)
  if (!/^\d/.test(entry.slice(prefix.length))) continue
  fs.rmSync(path.join(releaseDir, entry), { force: true })
  removed += 1
  console.log(`clean-release: removed ${entry}`)
}
if (removed === 0) console.log('clean-release: no stale tarball to remove')
