import { EVENT_POOLS, POOL_ORDER } from "@/desk/lib/rarity"
import { useFlat } from "@/flat/context"
import { Link } from "@/flat/Link"
import { FLAT_ROUTES } from "@/flat/router"
import { packName } from "@/flat/ui/Rewards"

/** 常驻卡池在前，活动包随后，内容表之外的（神秘卡包）排最后 */
const KNOWN_ORDER: readonly string[] = [...POOL_ORDER, ...EVENT_POOLS]

/** 首页的卡包卡：每种卡包还有几包，和去开包的按钮 */
export function PacksCard({ primary }: { primary: boolean }) {
  const { packs } = useFlat()
  const pools = packs
    ? [...KNOWN_ORDER, ...Object.keys(packs).filter((pool) => !KNOWN_ORDER.includes(pool))].filter(
        (pool) => (packs[pool] ?? 0) > 0,
      )
    : []

  return (
    <section className="fl-card home-packs">
      <div className="fl-card__head">
        <h2 className="fl-card__title">卡包</h2>
      </div>
      {packs === null ? (
        <p className="bk-note">正在数卡包……</p>
      ) : pools.length === 0 ? (
        <p className="bk-note">一包都没有了。远征、成就和签到都能拿到卡包。</p>
      ) : (
        <ul className="home-packs__list">
          {pools.map((pool) => (
            <li key={pool}>
              <span>{packName(pool)}</span>
              <span className="bk-num">×{packs?.[pool]}</span>
            </li>
          ))}
        </ul>
      )}
      <Link
        className={`bk-btn bk-btn--block ${primary ? "bk-btn--main" : ""}`}
        to={FLAT_ROUTES.packs}
      >
        开包
      </Link>
    </section>
  )
}
