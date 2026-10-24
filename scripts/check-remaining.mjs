/**
 * 幂等性检查：找出「本地化脚本再转换仍会有变化」的行（即残留简体或大陆用词）
 *
 * 与 convert-to-hk.mjs 走完全相同的规则链（OpenCC cn→hk + HK_TERMS），
 * 因此报出的行就是再次转换真的会变动的行。
 *
 * 运行：node scripts/check-remaining.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import * as OpenCCNS from 'opencc-js'
import { applyHkTerms } from './hk-terms.mjs'

const OpenCC = OpenCCNS.default ?? OpenCCNS
const conv = OpenCC.Converter({ from: 'cn', to: 'hk' })

// 转换工具自身保持原样，不参与检查
const SKIP_FILES = new Set(['scripts/convert-to-hk.mjs', 'scripts/check-remaining.mjs', 'scripts/hk-terms.mjs'])

const files = [
  'web/index.html',
  'README.md',
  'Dockerfile',
  'start.sh',
]
const dirs = ['web/src', 'src', 'functions']

function walk(d) {
  if (!fs.existsSync(d)) return
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name)
    if (e.isDirectory()) walk(f)
    else if (/\.(ts|vue|css|html|md|sh)$/i.test(f)) files.push(f)
  }
}
dirs.forEach(walk)

const suspicious = []
for (const file of files) {
  if (!fs.existsSync(file)) continue
  const rel = file.replace(/\\/g, '/')
  if (SKIP_FILES.has(rel)) continue
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    const c = applyHkTerms(conv(line))
    if (c !== line && /[\u4e00-\u9fff]/.test(line)) {
      suspicious.push(`${rel}:${i + 1}: ${line.trim().slice(0, 90)}`)
      suspicious.push(`    → ${c.trim().slice(0, 90)}`)
    }
  })
}
console.log('suspicious lines:', suspicious.length)
console.log(suspicious.slice(0, 80).join('\n'))
