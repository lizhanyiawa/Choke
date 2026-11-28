import { useEffect, useState } from "react"

import { battlePower } from "@/card/data"
import { GameCardFace } from "@/card/GameCardFace"
import { fetchDeck, toFace, type ApiDeck } from "@/desk/session/api"
import { useFlat } from "@/flat/context"
import { Link } from "@/flat/Link"
import { FLAT_ROUTES } from "@/flat/router"
import { DECK_SIZE } from "@choke/shared/config"

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; deck: ApiDeck }

const SLOTS = Array.from({ length: DECK_SIZE }, (_, slot) => slot)

/** 首页的卡组卡：出战的七张卡、总战力，和去编辑的入口 */
export function DeckCard() {
  const { user } = useFlat()
  const [state, setState] = useState<State>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchDeck(user.id, controller.signal)
      .then((deck) => setState({ status: "ready", deck }))
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status: "error",
          message: reason instanceof Error ? reason.message : "卡组取不回来，请稍后再试",
        })
      })
    return () => controller.abort()
  }, [user.id, attempt])

  const cards = state.status === "ready" ? state.deck.slots.map((slot) => slot.card) : []
  const filled = cards.filter((card) => card !== null)
  const power = filled.reduce((sum, card) => sum + battlePower(toFace(card)), 0)

  return (
    <section className="fl-card home-deck">
      <div className="fl-card__head">
        <h2 className="fl-card__title">我的卡组</h2>
        {state.status === "ready" && (
          <span className="fl-card__meta">
            <span className="bk-num">
              {filled.length}/{DECK_SIZE}
            </span>
            {filled.length > 0 && (
              <>
                {" · 总战力 "}
                <span className="bk-num">{power.toLocaleString("en-US")}</span>
              </>
            )}
          </span>
        )}
        <Link className="fl-link" to={FLAT_ROUTES.deck}>
          编辑卡组
        </Link>
      </div>
      {state.status === "error" ? (
        <div className="bk-empty">
          <span className="bk-error">{state.message}</span>
          <button
            type="button"
            className="bk-btn bk-btn--sm"
            onClick={() => {
              setState({ status: "loading" })
              setAttempt((value) => value + 1)
            }}
          >
            重试
          </button>
        </div>
      ) : (
        <ul className="home-deck__slots" aria-busy={state.status === "loading"}>
          {SLOTS.map((slot) => {
            const card = cards[slot] ?? null
            return (
              <li key={slot} className={card ? undefined : "bk-slot"}>
                {card ? <GameCardFace card={toFace(card)} /> : state.status === "ready" ? "+" : ""}
              </li>
            )
          })}
        </ul>
      )}
      {state.status === "ready" && filled.length < DECK_SIZE && (
        <p className="bk-note">卡组还没排满，空着的位置不会上场。</p>
      )}
    </section>
  )
}
