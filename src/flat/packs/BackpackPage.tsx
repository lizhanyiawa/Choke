import { useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import { GiNotebook } from "react-icons/gi"

import { playSfx } from "@/audio/sfx"
import { GameCardFace } from "@/card/GameCardFace"
import { RARITY_LABEL, battlePower } from "@/card/data"
import { RARITY_COLOR } from "@/desk/lib/rarity"
import { MysteryQuestionnaire } from "@/desk/panels/cards/MysteryQuestionnaire"
import { fetchGameConfig, openMysteryPack, toFace, type ApiUserCard, type ItemWallet } from "@/desk/session/api"
import { useFlat } from "@/flat/context"
import { Link } from "@/flat/Link"
import { refreshQuests } from "@/flat/quests/store"
import { FLAT_ROUTES } from "@/flat/router"
import { FlatDialog } from "@/flat/ui/FlatDialog"
import { useResource } from "@/flat/ui/useResource"
import { refreshProgress } from "@/tutorial/store"
import { CONTENT, MYSTERY_PACK_ID } from "@choke/shared/content"
import { SHARD_ITEMS } from "@choke/shared/items"

import { PackImage, PackList, PackLoadError, packTotal, visiblePacks, type PackChoice } from "./packCatalog"
import "./packs.css"

const TABS = [["packs", "卡包"], ["shards", "碎片与经验池"]] as const
type Tab = (typeof TABS)[number][0]

export function BackpackPage() {
  const { user, progress, packs, packError, setPacks, refreshPacks, refreshUser, notify } = useFlat()
  const config = useResource(fetchGameConfig)
  const [tab, setTab] = useState<Tab>("packs")
  const [picked, setPicked] = useState<PackChoice | null>(null)
  const [questionnaire, setQuestionnaire] = useState(false)
  const [showHero, setShowHero] = useState(false)
  const [claimed, setClaimed] = useState<{ hero: ApiUserCard | null } | null>(null)
  const mounted = useRef(false)

  useLayoutEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const hero = user.hero ?? claimed?.hero ?? null
  const heroClaimed = !!hero || claimed !== null
  const choices = [
    ...visiblePacks(config.data, packs).map((pack) => ({ ...pack, count: packs ? packs[pack.id] ?? 0 : null, bound: false })),
    {
      id: MYSTERY_PACK_ID,
      name: config.data?.starterPacks.find((pack) => pack.id === MYSTERY_PACK_ID)?.name ?? CONTENT.packs.mystery.name,
      count: packs ? packs[MYSTERY_PACK_ID] ?? 0 : null,
      bound: false,
      claimed: heroClaimed,
    } as const,
  ]
  const selected = choices.find((pack) => pack.id === picked)
    ?? choices.find((pack) => (pack.count ?? 0) > 0)
    ?? choices[0]!
  const mystery = selected.id === MYSTERY_PACK_ID
  const heroFace = mystery && hero ? toFace(hero) : null
  const count = selected.count ?? 0
  const mysteryLock = !user.onboarded ? "请先领取新手礼包" : !progress.linkedAccount ? "请先绑定 osu! 账号" : null

  async function claimHero(answers: string[]) {
    try {
      const result = await openMysteryPack(user.id, answers)
      void refreshProgress(user.id)
      void refreshQuests()
      refreshUser()
      if (!mounted.current) {
        refreshPacks()
        return
      }
      setPacks(result.packs)
      setClaimed({ hero: result.hero })
      notify("已领取本体卡", "success")
    } catch (error) {
      if (mounted.current) {
        refreshPacks()
        refreshUser()
      }
      throw error
    }
  }

  return (
    <div className="fl-page fl-backpack">
      <header className="fl-page__head"><h1 className="fl-page__title">背包</h1></header>
      <div className="fl-backpack__tabs" role="group" aria-label="背包分类">
        {TABS.map(([id, label]) => (
          <button type="button" key={id} aria-pressed={tab === id} onClick={() => {
            if (tab === id) return
            playSfx("tick")
            setTab(id)
            if (id !== "packs") refreshUser()
          }}>{label}</button>
        ))}
      </div>
      {tab === "packs" ? (
        <>
          {config.error && <PackLoadError message={config.error} retry={config.reload} />}
          {packError && <PackLoadError message={packError} retry={refreshPacks} />}
          {!config.data && !config.error && <p role="status">加载卡包配置…</p>}
          {config.data && (
            <div className="fl-backpack__layout">
              <PackList inventory title="卡包库存" total={packTotal(packs)} choices={choices} selected={selected.id} onSelect={(id) => {
                if (id !== selected.id) playSfx("tick")
                setPicked(id)
              }} />
              <section className="fl-card fl-backpack__detail">
                <div className="fl-backpack__preview">
                  {heroFace ? <div className="fl-backpack__hero"><GameCardFace card={heroFace} /></div> : <PackImage id={selected.id} />}
                  <div className="fl-pack-detail__text">
                    <h2>{heroFace?.name ?? selected.name}</h2>
                    {heroFace ? (
                      <>
                        <span className="fl-good">本体卡已获得</span>
                        <p>{RARITY_LABEL[heroFace.rarity]} · BP {battlePower(heroFace).toLocaleString()}</p>
                      </>
                    ) : (
                      <>
                        <p className="fl-backpack__stock-label">当前库存</p>
                        <p className="fl-backpack__stock"><strong className="fl-info">{selected.count?.toLocaleString() ?? "—"}</strong> 包</p>
                        <p>{mystery ? "只开出你的本体卡" : `每包 ${config.data.packSize} 张`}</p>
                      </>
                    )}
                  </div>
                </div>
                <div className="fl-backpack__action">
                  {mystery ? (
                    heroClaimed ? (
                      <button type="button" className="bk-btn bk-btn--main bk-btn--block" disabled={!heroFace} onClick={() => setShowHero(true)}>
                        {heroFace ? "查看本体卡" : "本体卡已获得"}
                      </button>
                    ) : (
                      <button type="button" className="bk-btn bk-btn--main bk-btn--block" disabled={count <= 0 || !!mysteryLock || questionnaire} onClick={() => {
                        playSfx("click")
                        setQuestionnaire(true)
                      }}>{count <= 0 ? "没有神秘卡包" : mysteryLock ?? "开启神秘卡包"}</button>
                    )
                  ) : count > 0 ? (
                    <Link className="bk-btn bk-btn--main bk-btn--block" to={`${FLAT_ROUTES.packs}?${new URLSearchParams({ pool: selected.id })}`}>
                      去开{selected.name}
                    </Link>
                  ) : (
                    <button type="button" className="bk-btn bk-btn--main bk-btn--block" disabled>{packs ? "没有卡包" : "库存未就绪"}</button>
                  )}
                </div>
              </section>
            </div>
          )}
        </>
      ) : (
        <Wallet items={user.items} expPool={user.expPool ?? 0} refresh={refreshUser} />
      )}
      {questionnaire && <MysteryQuestionnaire onSubmit={claimHero} onClose={() => setQuestionnaire(false)} />}
      {showHero && heroFace && (
        <FlatDialog title="本体卡" onClose={() => setShowHero(false)}>
          <div className="fl-backpack__hero-dialog"><GameCardFace card={heroFace} /></div>
          <p className="bk-note">{heroFace.name} · {RARITY_LABEL[heroFace.rarity]} · BP {battlePower(heroFace).toLocaleString()}</p>
        </FlatDialog>
      )}
    </div>
  )
}

function Wallet({ items, expPool, refresh }: { items?: ItemWallet; expPool: number; refresh: () => void }) {
  const entries = SHARD_ITEMS
  return (
    <div className="fl-backpack__wallets">
      <section className="fl-card fl-backpack__wallet fl-backpack__exp-pool">
        <header className="fl-card__head">
          <h2 className="fl-card__title">经验池</h2>
          <span className="fl-card__meta">通用卡牌经验</span>
        </header>
        <div className="fl-backpack__exp-row">
          <span className="fl-backpack__item-name">
            <GiNotebook className="fl-backpack__exp-icon" aria-hidden />
            可用经验余额
          </span>
          <strong className={expPool > 0 ? "fl-info bk-num" : "fl-card__meta bk-num"}>
            {expPool.toLocaleString("en-US")} EXP
          </strong>
        </div>
        <p className="bk-note">
          远征战斗与首通累计获得，不可交易。可在卡册点开任意卡牌的详情页自由分配升级。
        </p>
        <Link className="fl-link" to={FLAT_ROUTES.album}>
          去卡册分配
        </Link>
      </section>
      {!items ? (
        <PackLoadError message="碎片库存暂不可用" retry={refresh} />
      ) : (
        <section className="fl-card fl-backpack__wallet">
          <header className="fl-card__head">
            <h2 className="fl-card__title">碎片</h2>
            <span className="fl-card__meta">{entries.length} 种碎片</span>
          </header>
          <ul>
            {entries.map((item) => (
              <li key={item.id}>
                <span className="fl-backpack__item-name">
                  <i style={{ "--shard-color": RARITY_COLOR[item.rarity] } as CSSProperties} aria-hidden />
                  {item.name}
                </span>
                <b className={(items[item.id] ?? 0) > 0 ? "fl-info" : "fl-card__meta"}>
                  ×{(items[item.id] ?? 0).toLocaleString()}
                </b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
