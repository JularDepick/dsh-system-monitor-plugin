/*
 * 构建前置清理:清空 release/ 目录(旧 pack 与历史残骸)
 *
 * 由 package.json 的 build 脚本前置调用;release/ 仅存放 pack
 * tarball(postpack 归位),每次构建前整体清空,保证只留最新产物。
 * 作者:JularDepick
 */

const fs = require('node:fs')
const path = require('node:path')

const releaseDir = path.join(__dirname, '..', 'release')
if (!fs.existsSync(releaseDir)) process.exit(0)

let removed = 0
for (const entry of fs.readdirSync(releaseDir)) {
  fs.rmSync(path.join(releaseDir, entry), { recursive: true, force: true })
  removed += 1
  console.log(`clean-release: removed ${entry}`)
}
if (removed === 0) console.log('clean-release: release/ already empty')