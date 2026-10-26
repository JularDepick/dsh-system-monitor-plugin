/*
 * 打包前置清理:清空 release/ 目录(旧 pack 与历史残骸)
 *
 * 由 package.json 的 prepack 钩子调用(pack 之前);release/ 仅存放 pack
 * tarball(postpack 归位),每次打包前整体清空,保证只留最新产物。
 * 刻意不挂在 build 上:构建与安装都会经 prepare 触发 build,若在 build 里清空,
 * 打包后再次构建就会把已产出的 tarball 删掉且不再重建。
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