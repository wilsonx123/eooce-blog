import os from 'node:os'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

// 每次運行使用獨立臨時目錄，避免殘留進程的檔案鎖影響測試
export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.ts'],
    env: {
      BLOG_DB_PATH: path.join(os.tmpdir(), `blog-test-${Date.now()}`, 'blog.db'),
      JWT_SECRET: 'test-secret',
    },
  },
})
