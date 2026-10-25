/**
 * 一次性字體轉換：HarmonyOS Sans SC 的 TTF 轉為 woff2（體積減約一半）。
 * 用法：node scripts/fonts-to-woff2.mjs
 * 轉換完成後 style.css 引用 woff2，原始 TTF 已從倉庫移除，重複運行安全跳過。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ttf2woff2 = require('ttf2woff2').default

const dir = path.resolve('web/src/assets/fonts')
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.ttf')) continue
  const ttf = path.join(dir, file)
  const woff2 = ttf.replace(/\.ttf$/, '.woff2')
  if (fs.existsSync(woff2)) {
    console.log(`跳過（已存在）: ${file}`)
    continue
  }
  const input = fs.readFileSync(ttf)
  const output = ttf2woff2(input)
  fs.writeFileSync(woff2, output)
  console.log(
    `轉換: ${file} ${(input.length / 1024 / 1024).toFixed(1)}MB → ${path.basename(woff2)} ${(output.length / 1024 / 1024).toFixed(1)}MB`,
  )
}
