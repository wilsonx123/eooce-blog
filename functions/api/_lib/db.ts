/** D1 語句封裝：把 better-sqlite3 風格的調用（.get/.all/.run）映射到 D1 API */

type SqlItem = { sql: string; params?: unknown[] }

export function stmt(db: D1DatabaseLike, sql: string, ...params: unknown[]): D1Statement {
  const s = db.prepare(sql)
  if (params.length) return s.bind(...params)
  return s
}

/** 對應 better-sqlite3 的 .get()：找不到返回 undefined */
export async function qFirst<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  ...params: unknown[]
): Promise<T | undefined> {
  const row = await stmt(db, sql, ...params).first<T>()
  return row ?? undefined
}

/** 對應 better-sqlite3 的 .all() */
export async function qAll<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const { results } = await stmt(db, sql, ...params).all<T>()
  return results
}

/** 對應 better-sqlite3 的 .run()，返回改動行數與自增 id */
export async function qRun(
  db: D1DatabaseLike,
  sql: string,
  ...params: unknown[]
): Promise<{ changes: number; lastRowId: number }> {
  const res = await stmt(db, sql, ...params).run()
  return { changes: res.meta.changes ?? 0, lastRowId: res.meta.last_row_id ?? 0 }
}

/**
 * 對應 better-sqlite3 的 transaction()：D1 的 batch 是原子的，
 * 多條寫入按順序打包執行，任一失敗整體回滾。
 */
export function qBatch(db: D1DatabaseLike, items: SqlItem[]): Promise<unknown> {
  return db.batch(items.map((it) => stmt(db, it.sql, ...(it.params ?? []))))
}
