import { fetchUserCards, type ApiUserCard } from "@/desk/session/api"

export interface LoadedCards {
  rows: ApiUserCard[]
  /** 服务端报告的总数；可能大于 rows.length（触发安全上限时） */
  total: number
  truncated: boolean
}

const PAGE_SIZE = 60
/** 安全上限：正常账号远低于这个数；防止 total 异常时无限翻页 */
const MAX_PAGES = 200

/** 把玩家的全部卡分页取回来（接口一页最多 60 张），按稀有度排序 */
export async function loadAllCards(userId: string, signal?: AbortSignal): Promise<LoadedCards> {
  const rows: ApiUserCard[] = []
  let total = 0
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await fetchUserCards(userId, { sort: "rarity", page, limit: PAGE_SIZE, signal })
    total = res.total
    rows.push(...res.rows)
    if (res.rows.length === 0 || rows.length >= total) break
  }
  return { rows, total, truncated: rows.length < total }
}
