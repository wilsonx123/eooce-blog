/**
 * 一次性转换脚本：简体中文 → 香港繁体中文（zh-HK）
 * 1. OpenCC cn→hk 逐字转换
 * 2. 术语本地化（香港习惯用词：伺服器/資料庫/電郵/支援 …）
 *
 * 运行：node scripts/convert-to-hk.mjs
 * 脚本为幂等设计：先转再替换，重复执行结果一致（二次执行通常无变化）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as OpenCCNS from 'opencc-js'
import { applyHkTerms } from './hk-terms.mjs'

const OpenCC = OpenCCNS.default ?? OpenCCNS
const converter = OpenCC.Converter({ from: 'cn', to: 'hk' })

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')


const TARGET_PATTERNS = [
  // 前端
  'web/src/**/*.vue',
  'web/src/**/*.ts',
  'web/src/**/*.css',
  'web/vite.config.ts',
  'web/tailwind.config.js',
  'web/postcss.config.js',
  'web/index.html',
  // 后端（Express 版本，本地/Docker 部署仍使用）
  'src/**/*.ts',
  'vitest.config.ts',
  // 新增的 Cloudflare Pages Functions（可用简体书写，再次运行即可统一转换为繁体）
  'functions/**/*.ts',
  // 文档与脚本
  'README.md',
  'start.sh',
  'Dockerfile',
]

function patternToRegex(pattern) {
  const segs = pattern.split('/')
  let re = ''
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]
    const isLast = i === segs.length - 1
    if (seg === '**') {
      re += isLast ? '(?:[^\\\\/]+(?:/[^\\\\/]*)*)?' : '(?:[^\\\\/]+/)*'
      if (isLast) break
      continue
    }
    const segRe = seg.split('*').map((p) => p.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('[^\\\\/]*')
    re += segRe + (isLast ? '' : '/')
  }
  return new RegExp('^' + re + '$')
}

function listFiles(pattern) {
  if (!pattern.includes('*')) return [path.join(rootDir, pattern)]
  const segs = pattern.split('/')
  const regex = patternToRegex(pattern)
  const srcDir = path.join(rootDir, segs[0].includes('*') ? '.' : segs[0])
  const candidates = walk(srcDir).map((f) => path.relative(rootDir, f).replace(/\\/g, '/'))
  return candidates.filter((rel) => regex.test(rel)).map((rel) => path.join(rootDir, rel))
}

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

let changed = 0
const allPaths = TARGET_PATTERNS.flatMap(listFiles)
const unique = [...new Set(allPaths)]

for (const file of unique) {
  const rel = path.relative(rootDir, file)
  if (rel.includes('node_modules') || rel.includes('dist')) continue
  const source = fs.readFileSync(file, 'utf8')
  let output = converter(source)
  output = applyHkTerms(output)
  if (output !== source) {
    fs.writeFileSync(file, output)
    changed += 1
    console.log('converted:', rel)
  }
}
console.log(`\ndone. ${changed} file(s) updated.`)
