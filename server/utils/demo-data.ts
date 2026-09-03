import type { DemoItem } from '../../shared/schemas/demo'

/**
 * ⚠️ 示範用的假資料 —— 正式專案請刪除這個檔案，以及 `server/api/demo/` 底下
 * 引用它的分支。
 *
 * 存在的理由：讓這個樣板 clone 下來、不設定任何外部 API 就能 `pnpm dev` 看到
 * 完整的畫面與資料流，也讓整合測試不必依賴外部服務。
 */
export const DEMO_ITEMS: DemoItem[] = Array.from({ length: 47 }, (_, index) => ({
  id: String(index + 1),
  title: `示範項目 ${index + 1}`,
  description: `這是第 ${index + 1} 筆示範資料，用來展示分頁、SSR 與統一回應格式。`,
  createdAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
}))

/** 取得分頁後的假資料。 */
export function paginateDemoItems(page: number, pageSize: number) {
  const start = (page - 1) * pageSize
  return {
    items: DEMO_ITEMS.slice(start, start + pageSize),
    total: DEMO_ITEMS.length,
  }
}
