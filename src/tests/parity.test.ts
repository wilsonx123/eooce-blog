/**
 * 雙後端一致性守衞：新增網站設定 key 時必須同步四處
 * （functions/api/_lib/admin-routes.ts、src/routes/admin.ts、web/src/types.ts、後台設定頁），
 * 本測試自動比對三個宣告源的 key 清單，遺漏任何一處即失敗。
 */
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string): string => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

/** 從 PUT /site 的 zod schema（z.object({...})）提取欄位名清單 */
function zodSchemaKeys(source: string, marker: string): string[] {
  const start = source.indexOf(marker)
  expect(start, `找不到標記 ${marker}，schema 寫法可能已改動`).toBeGreaterThan(-1)
  const schemaStart = source.indexOf('z.object({', start)
  const schemaEnd = source.indexOf('\n  })', schemaStart)
  expect(schemaEnd, '找不到 schema 結尾').toBeGreaterThan(schemaStart)
  return [...source.slice(schemaStart, schemaEnd).matchAll(/^ {4}(\w+): z\./gm)].map((m) => m[1])
}

/** 從 interface SiteInfo 提取欄位名清單 */
function siteInfoKeys(source: string): string[] {
  const start = source.indexOf('export interface SiteInfo {')
  expect(start, '找不到 SiteInfo 定義').toBeGreaterThan(-1)
  const end = source.indexOf('\n}', start)
  return [...source.slice(start, end).matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1])
}

const cfKeys = zodSchemaKeys(read('../../functions/api/_lib/admin-routes.ts'), `route('PUT', 'admin/site'`)
const expressKeys = zodSchemaKeys(read('../routes/admin.ts'), `router.put('/site'`)
const webKeys = siteInfoKeys(read('../../web/src/types.ts'))

describe('site_settings key 雙後端一致性', () => {
  it('兩邊後端 schema 均聲明瞭全部 key', () => {
    expect(cfKeys.length).toBeGreaterThan(10)
    expect([...cfKeys].sort()).toEqual([...expressKeys].sort())
  })

  it('key 清單無重複且與前台 SiteInfo 型別一致', () => {
    expect(new Set(cfKeys).size).toBe(cfKeys.length)
    expect([...webKeys].sort()).toEqual([...cfKeys].sort())
  })
})
