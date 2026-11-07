import { useMemo, useState } from "react"

import { CardFace } from "@/card/CardFace"
import type { Rarity } from "@/card/types"

import { defRow } from "@/card/def"

import { defFromPool } from "./def"
import { buildPool, claim, faceFromPool, revoke, type PoolCard } from "./index"
import type { OsuSelf } from "./hero"
import "./pool-lab.css"
import "@/card/card-lab.css"

const RARITY_ORDER: Rarity[] = ["C", "UC", "R", "E", "L", "Radiant", "Prismatic"]

const SAMPLE = [
  {
    osuId: 124493,
    username: "chocomint",
    country: "KR",
    title: null,
    followerCount: 166544,
    globalRank: 104,
    mappingFollowerCount: 5785,
    rankedMaps: 0,
    guestMaps: 4,
    lovedMaps: 0,
    popularity: 15874,
    pp: 18670.2,
    avatarUrl: "https://a.ppy.sh/124493?1791390129.jpeg",
    coverUrl:
      "https://assets.ppy.sh/user-cover-presets/6/a7d51a05cb3c08a43531dfa8dc99c2fc7fe0d8cfce2756c340f11b3683b5d3bf.jpeg",
  },
  {
    osuId: 7562902,
    username: "mrekk",
    country: "AU",
    title: null,
    followerCount: 110162,
    globalRank: 1,
    mappingFollowerCount: 8306,
    rankedMaps: 2,
    guestMaps: 2,
    lovedMaps: 1,
    popularity: 15391,
    pp: 32269,
    avatarUrl: "https://a.ppy.sh/7562902?1792410222.png",
    coverUrl:
      "https://assets.ppy.sh/user-cover-presets/3/32ddb3eb261e38a82067f9ef4ea96c12f6abf8bd228e6413330f9d351420301b.jpeg",
  },
  {
    osuId: 4504101,
    username: "WhiteCat",
    country: "DE",
    title: null,
    followerCount: 101222,
    globalRank: 53,
    mappingFollowerCount: 6754,
    rankedMaps: 0,
    guestMaps: 0,
    lovedMaps: 0,
    popularity: 14562,
    pp: 20212.2,
    avatarUrl: "https://a.ppy.sh/4504101?1771343791.jpeg",
    coverUrl:
      "https://assets.ppy.sh/user-profile-covers/4504101/1072f8933a2ca39f2eec43fbc9bcbdeeec11dd7288a5679c55a5c6b61b470eb8.png",
  },
  {
    osuId: 10549880,
    username: "NINERIK",
    country: "NO",
    title: null,
    followerCount: 12690,
    globalRank: 5,
    mappingFollowerCount: 244,
    rankedMaps: 0,
    guestMaps: 0,
    lovedMaps: 0,
    popularity: 10559,
    pp: 27135.2,
    avatarUrl: "https://a.ppy.sh/10549880?1792501944.png",
    coverUrl:
      "https://assets.ppy.sh/user-profile-covers/10549880/ebcc75de7a336fbf96cac4c3de0754d599a019d648371aafd6b060edd25d7774.jpeg",
  },
  { osuId: 2, username: "peppy", country: "AU", title: "osu!", followerCount: 15820, globalRank: null },
  { osuId: 39828, username: "Rafis", country: "PL", title: null, followerCount: 6100, globalRank: 240 },
  { osuId: 6447458, username: "Vaxei", country: "US", title: null, followerCount: 7300, globalRank: 38 },
  { osuId: 2111444, username: "Sotarks", country: "US", title: null, followerCount: 5400, globalRank: 9030 },
  { osuId: 4196808, username: "Tillerino", country: "DE", title: null, followerCount: 3200, globalRank: 41200 },
  { osuId: 1125641, username: "Hydra", country: "CN", title: null, followerCount: 2100, globalRank: 1180 },
  { osuId: 233239, username: "Natsume", country: "JP", title: null, followerCount: 1900, globalRank: 640 },
  { osuId: 3423242, username: "rrtyui", country: "JP", title: null, followerCount: 4300, globalRank: 2600 },
  { osuId: 877327, username: "Amamiya", country: "CN", title: null, followerCount: 870, globalRank: 3800 },
  { osuId: 1063055, username: "Moe", country: "TW", title: null, followerCount: 640, globalRank: 5100 },
  { osuId: 1287328, username: "Delis", country: "RU", title: null, followerCount: 1200, globalRank: 720 },
  { osuId: 3303032, username: "Aricin", country: "US", title: null, followerCount: 380, globalRank: 8800 },
  { osuId: 7257277, username: "Karthy", country: "GB", title: null, followerCount: 290, globalRank: 14200 },
  { osuId: 4938256, username: "idke", country: "US", title: null, followerCount: 2600, globalRank: 310 },
  { osuId: 2757683, username: "Bubbleman", country: "CA", title: null, followerCount: 1700, globalRank: 950 },
  { osuId: 45221, username: "Doomsday", country: "DE", title: null, followerCount: 980, globalRank: 4900 },
  { osuId: 196981, username: "NerO", country: "BR", title: null, followerCount: 760, globalRank: 2200 },
  { osuId: 1572007, username: "Yaong", country: "KR", title: null, followerCount: 2100, globalRank: 180 },
  { osuId: 3670601, username: "FlyingTuna", country: "KR", title: null, followerCount: 3300, globalRank: 60 },
  { osuId: 2168763, username: "WubWoofWolf", country: "CA", title: null, followerCount: 1450, globalRank: 6100 },
  { osuId: 1410290, username: "Mismagius", country: "CN", title: null, followerCount: 1100, globalRank: 2700 },
  { osuId: 5807811, username: "Andros", country: "FR", title: null, followerCount: 420, globalRank: 8300 },
  { osuId: 3000011, username: "Kaguya", country: "CN", title: null, followerCount: 64, globalRank: 6200 },
  { osuId: 3000012, username: "Yuki", country: "CN", title: null, followerCount: 38, globalRank: 7100 },
  { osuId: 3000013, username: "Rin", country: "CN", title: null, followerCount: 22, globalRank: 8600 },
  { osuId: 3000014, username: "Hoshino", country: "CN", title: null, followerCount: 140, globalRank: 9300 },
  { osuId: 3000015, username: "Sora", country: "CN", title: null, followerCount: 51, globalRank: 10400 },
  { osuId: 3000016, username: "Mei", country: "CN", title: null, followerCount: 17, globalRank: 11800 },
  { osuId: 3000017, username: "Koi", country: "CN", title: null, followerCount: 96, globalRank: 12600 },
  { osuId: 3000018, username: "Nagi", country: "CN", title: null, followerCount: 31, globalRank: 13900 },
  { osuId: 3000019, username: "Aoi", country: "CN", title: null, followerCount: 205, globalRank: 5200 },
]

const PAGE_SIZE = 48

export function PoolLab() {
  const [raw, setRaw] = useState("")
  const [seed, setSeed] = useState("20261106")
  const [cards, setCards] = useState<PoolCard[] | null>(null)
  const [stats, setStats] = useState<{ assigned: Record<Rarity, number>; visible: number } | null>(null)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [meRaw, setMeRaw] = useState("")
  const [error, setError] = useState<string | null>(null)

  const selectedCard = cards?.find((card) => card.osuId === selected) ?? null

  const pageCards = useMemo(() => {
    if (!cards) return []
    return cards.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  }, [cards, page])

  function load(input: string) {
    try {
      const parsed = JSON.parse(input)
      const result = buildPool(parsed, { seed: Number(seed) || 0 })
      setCards(result.cards)
      setStats({ assigned: result.assigned, visible: result.visible })
      setPage(0)
      setSelected(null)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败")
    }
  }

  function onFile(file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? "")
      setRaw(text)
      load(text)
    }
    reader.readAsText(file)
  }

  function update(next: PoolCard) {
    if (!cards) return
    const merged = cards.map((card) => (card.osuId === next.osuId ? next : card))
    setCards(merged)
    setStats({
      assigned: countRarity(merged),
      visible: merged.filter((card) => !card.hidden).length,
    })
  }

  function onClaim() {
    if (!selectedCard) return
    try {
      const user = JSON.parse(meRaw) as OsuSelf
      if (!user || typeof user !== "object") throw new Error("需要 /me/osu 的 JSON")
      update(claim(selectedCard, user))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "认领数据无效")
    }
  }

  function exportCards() {
    if (!cards) return
    const rows = cards.map((card) => defRow(defFromPool(card)))
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = "choke-cards.json"
    link.click()
  }

  return (
    <div className="lab pool-lab" data-bg="dark">
      <header className="lab__bar">
        <div>
          <div className="lab__eyebrow">CHOKE! · CARD POOL</div>
          <h1 className="lab__title">卡池实验室</h1>
          <p className="lab__sub">
            Mutualify 名单 → 一个 seed 定占比 → 国榜下限抬档 → 卡面随看随载
          </p>
        </div>
        <div className="pool-lab__actions">
          <label className="pool-lab__file">
            导入 JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => onFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button type="button" className="lab__toggle" onClick={() => load(JSON.stringify(SAMPLE))}>
            载入示例
          </button>
        </div>
      </header>

      <section className="lab__section">
        <div className="lab__section-head">
          <h2>输入</h2>
          <p>浏览器控制台导出的数组，或 /api/rankings 的原始 user</p>
        </div>
        <div className="pool-lab__toolbar">
          <label className="pool-lab__field">
            <span>seed</span>
            <input value={seed} onChange={(event) => setSeed(event.target.value)} inputMode="numeric" />
          </label>
          <button type="button" className="lab__toggle" onClick={() => load(raw)} disabled={!raw.trim()}>
            按 seed 重算
          </button>
          <label className="pool-lab__field pool-lab__field--grow">
            <span>JSON</span>
            <textarea
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              placeholder='[{"osuId": 2, "username": "peppy", "country": "AU", "followerCount": 15820}]'
              spellCheck={false}
            />
          </label>
        </div>
        {error && <p className="pool-lab__error">{error}</p>}
      </section>

      {cards && stats && (
        <>
          <section className="lab__section">
            <div className="lab__section-head">
              <h2>分配</h2>
              <p>
                共 {cards.length} 张 · 可抽 {stats.visible} 张 · 被国榜下限抬档{" "}
                {cards.filter((card) => card.floor != null).length} 张
              </p>
            </div>
            <div className="pool-lab__stats">
              {RARITY_ORDER.map((rarity) => {
                const count = stats.assigned[rarity] ?? 0
                const share = cards.length ? (count / cards.length) * 100 : 0
                return (
                  <div className="pool-lab__stat" data-rarity={rarity} key={rarity}>
                    <span className="pool-lab__stat-name">{rarity}</span>
                    <b>{count.toLocaleString()}</b>
                    <span className="pool-lab__stat-share">{share.toFixed(2)}%</span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="lab__section">
            <div className="lab__section-head">
              <h2>卡池</h2>
              <p>
                第 {page + 1} / {Math.max(1, Math.ceil(cards.length / PAGE_SIZE))} 页 · 点卡看详情
              </p>
            </div>
            <div className="pool-lab__grid">
              {pageCards.map((card) => (
                <button
                  type="button"
                  className="pool-lab__slot"
                  data-hidden={card.hidden || undefined}
                  data-active={card.osuId === selected || undefined}
                  key={card.osuId}
                  onClick={() => setSelected(card.osuId)}
                >
                  <CardFace card={faceFromPool(card)} />
                  <span className="lab__tag">
                    #{card.countryRank ?? "—"} {card.country} · {card.followerCount}
                  </span>
                </button>
              ))}
            </div>
            <div className="pool-lab__pager">
              <button
                type="button"
                className="lab__toggle"
                disabled={page === 0}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
              >
                上一页
              </button>
              <button
                type="button"
                className="lab__toggle"
                disabled={(page + 1) * PAGE_SIZE >= cards.length}
                onClick={() => setPage((value) => value + 1)}
              >
                下一页
              </button>
              <button type="button" className="lab__toggle" onClick={exportCards}>
                导出卡定义
              </button>
            </div>
          </section>
        </>
      )}

      {selectedCard && (
        <aside className="pool-lab__detail">
          <div className="pool-lab__detail-head">
            <div>
              <div className="lab__eyebrow">#{selectedCard.osuId}</div>
              <h2>{selectedCard.username}</h2>
              <p className="lab__sub">
                {selectedCard.country}
                {selectedCard.countryRank ? ` · 国内 #${selectedCard.countryRank} / ${selectedCard.countrySize}` : ""}
                {selectedCard.globalRank ? ` · 全球 #${selectedCard.globalRank}` : " · 无排名"}
              </p>
            </div>
            <button type="button" className="lab__toggle" onClick={() => setSelected(null)}>
              关闭
            </button>
          </div>

          <div className="pool-lab__detail-body">
            <div className="pool-lab__detail-card">
              <CardFace card={faceFromPool(selectedCard)} />
            </div>
            <div className="pool-lab__detail-card">
              <CardFace card={faceFromPool(selectedCard, true)} />
              <span className="lab__tag">
                {selectedCard.hero
                  ? `指数 ${selectedCard.hero.index} · ${selectedCard.hero.band} · ${selectedCard.hero.power}`
                  : "未认领 · 本体卡待定"}
              </span>
            </div>
            <dl className="pool-lab__kv">
              <dt>signal</dt>
              <dd>{selectedCard.signal.toFixed(1)}</dd>
              <dt>分项</dt>
              <dd>
                pp {fmt(selectedCard.scoreParts.pp)} · 排名 {fmt(selectedCard.scoreParts.rank)} · 粉丝{" "}
                {fmt(selectedCard.scoreParts.fans)} · 创作 {fmt(selectedCard.scoreParts.creation)}
              </dd>
              <dt>卡池档</dt>
              <dd>{selectedCard.rarity}</dd>
              <dt>国榜下限</dt>
              <dd>{selectedCard.floor ?? "未触发"}</dd>
              <dt>粉丝 / 谱面关注</dt>
              <dd>
                {selectedCard.followerCount ?? "—"}
                {selectedCard.mappingFollowers != null ? ` / ${selectedCard.mappingFollowers}` : ""}
              </dd>
              <dt>ranked 谱面</dt>
              <dd>
                {selectedCard.rankedSetCount ?? "未确认"}
                {selectedCard.rankedMaps != null
                  ? ` · ranked ${selectedCard.rankedMaps} / gd ${selectedCard.guestMaps ?? 0} / loved ${selectedCard.lovedMaps ?? 0}`
                  : ""}
              </dd>
              <dt>pp / 全球</dt>
              <dd>
                {selectedCard.pp != null ? selectedCard.pp.toFixed(0) : "—"} / {selectedCard.globalRank ?? "—"}
              </dd>
              <dt>banner</dt>
              <dd>{selectedCard.coverUrl ? selectedCard.coverUrl.split("/").slice(-2).join("/") : "没有"}</dd>
              <dt>状态</dt>
              <dd>{selectedCard.hidden ? "已下架" : selectedCard.claimed ? "已认领" : "在池"}</dd>
            </dl>
          </div>

          <div className="pool-lab__detail-actions">
            <button
              type="button"
              className="lab__toggle"
              onClick={() => update(selectedCard.hidden ? selectedCard : revoke(selectedCard))}
            >
              {selectedCard.hidden ? "恢复上架" : "本人下架"}
            </button>
            <a className="lab__toggle" href={selectedCard.profileUrl} target="_blank" rel="noreferrer">
              去主页
            </a>
          </div>

          <div className="pool-lab__claim">
            <label className="pool-lab__field">
              <span>认领：粘贴 /me/osu 的 JSON</span>
              <textarea
                value={meRaw}
                onChange={(event) => setMeRaw(event.target.value)}
                placeholder='{"username":"...","cover":{"url":"..."},"statistics":{"play_count":1,"total_hits":1,"level":{"current":1}}}'
                spellCheck={false}
              />
            </label>
            <button type="button" className="lab__toggle" onClick={onClaim} disabled={!meRaw.trim()}>
              算本体卡
            </button>
          </div>
        </aside>
      )}
    </div>
  )
}

function fmt(value: number | null): string {
  return value == null ? "—" : value.toFixed(0)
}

function countRarity(cards: readonly PoolCard[]): Record<Rarity, number> {  const counts: Record<Rarity, number> = {
    C: 0,
    UC: 0,
    R: 0,
    E: 0,
    L: 0,
    Radiant: 0,
    Prismatic: 0,
  }
  for (const card of cards) counts[card.rarity] += 1
  return counts
}
