import type { Rarity } from "@/card/types"
import type { EdgeBattle, EdgePoint } from "./edgeBattle"
import { arc, armorPaint, at, circlesOf, ease, heading, mix, path, polar, spectrum, unit, type ArmorPaint } from "./EdgeBulwarkFields"
import { along, areaPath, direction, edgeDistance, inside, isOutside, left, outward, type EdgeArea } from "./edgeSkills/geometry"
import { healerTraitArt } from "./edgeSkills/healerTraits"
import type { SkillVisual } from "./edgeSkills/presentation"
import { healerTraitReadiness } from "./edgeSkills/runtime"
import { unitOf } from "./edgeSkills/state"

type Art = NonNullable<ReturnType<typeof healerTraitArt>>
type Layer = "floor" | "front"
type Beat = NonNullable<SkillVisual["passive"]>
type Scene = { fx: SkillVisual; beat: Beat; art: Art; paint: ArmorPaint; t: number; to: EdgePoint }
const array = (count: number) => Array.from({ length: count }, (_, i) => i)
const pose = (where: EdgePoint, angle = 0, size = 1) => at(where) + ` rotate(${angle}) scale(${size})`
const offset = (p: EdgePoint, x: number, y: number) => ({ x: p.x + x, y: p.y + y })
const pulse = "M-33 2H-21l8-13 7 24L3-21l9 28 6-5h15"

function Seal({ at: where, art, paint, size = 1, angle = art.angle }: {
  at: EdgePoint; art: Art; paint: ArmorPaint; size?: number; angle?: number
}) {
  return <g transform={pose(where, angle, size)} strokeLinejoin="round" strokeLinecap="round">
    <path d={art.path} fill={paint.ink} fillOpacity=".56" stroke={paint.metal} strokeWidth="7.4" strokeOpacity=".25" />
    <path d={art.path} fill={paint.metal} fillOpacity=".12" stroke={paint.light} strokeWidth="2.3" />
  </g>
}

function stitch(from: EdgePoint, to: EdgePoint, bend: number, q: number) {
  const control = along(mix(from, to, .5), left(direction(from, to)), bend)
  const near = mix(from, control, q)
  return { control: near, head: mix(near, mix(control, to, q), q) }
}

function Thread({ from, to, paint, bend = 0, q = 1, width = 3, dashed = false, color }: {
  from: EdgePoint; to: EdgePoint; paint: ArmorPaint; bend?: number; q?: number; width?: number; dashed?: boolean; color?: string
}) {
  if (edgeDistance(from, to) < 4) return null
  const { control, head } = stitch(from, to, bend, q)
  const d = `M${from.x} ${from.y}Q${control.x} ${control.y} ${head.x} ${head.y}`
  return <g fill="none" strokeLinecap="round">
    <path d={d} stroke={color ?? paint.metal} strokeWidth={width * 3.2} strokeOpacity={dashed ? ".085" : ".20"} />
    <path d={d} stroke={color ?? paint.metal} strokeWidth={width} strokeDasharray={dashed ? "6 7" : undefined} />
    {!dashed && <path d={d} stroke={paint.light} strokeWidth={width * .40} />}
  </g>
}

function Armor({ where, angle, paint, q, width = 1, spread = 1 }: {
  where: EdgePoint; angle: number; paint: ArmorPaint; q: number; width?: number; spread?: number
}) {
  return <g transform={pose(where, angle, width)} strokeLinejoin="round">
    {[-1, 1].map(side => <path key={side} transform={`scale(1 ${side}) translate(0 ${q * 9 * spread})`}
      d="M-43 18-19 31-6 18 18 28 41 16 34 34 13 44-9 34-25 44-47 33Z"
      fill={paint.metal} fillOpacity=".19" stroke={paint.light} strokeWidth="2.9" />)}
  </g>
}

function Range({ area, paint, q, petals = false, reverse = false }: {
  area?: EdgeArea; paint: ArmorPaint; q: number; petals?: boolean; reverse?: boolean
}) {
  return area && <g fill="none">
    <path d={areaPath(area)} stroke={paint.accent} strokeWidth="2.4" strokeOpacity=".78" strokeDasharray="9 7"
      fill={paint.metal} fillOpacity=".085" />
    {circlesOf(area).map(({ center, radius }, i) => <g key={i} transform={pose(center, (reverse ? 1 - q : q) * 34)}>
      {array(petals ? 5 : 4).map(j => {
        const angle = j * (petals ? 72 : 90) - 24
        const r = radius * (reverse ? .94 - .44 * q : .45 + .49 * q)
        return petals ? <path key={j}
          d={path([polar(r * .51, angle - 13), polar(r * .83, angle - 21), polar(r, angle), polar(r * .81, angle + 22), polar(r * .51, angle + 13)]) + "Z"}
          fill={paint.metal} fillOpacity=".13" stroke={j % 2 ? paint.accent : paint.light} strokeWidth="3.0" />
          : <path key={j} d={arc(r, angle - 18, angle + 20)} stroke={j % 2 ? paint.accent : paint.light} strokeWidth="3.6" />
      })}
    </g>)}
  </g>
}

function Steps({ from, to, paint, q }: { from: EdgePoint; to: EdgePoint; paint: ArmorPaint; q: number }) {
  const distance = edgeDistance(from, to)
  if (distance < 12) return null
  const axis = direction(from, to)
  const count = Math.min(7, Math.max(2, Math.floor(distance / 25)))
  return <g fill={paint.metal} fillOpacity=".22" stroke={paint.light} strokeWidth="1.9">
    {array(count).map(i => {
      const alongStep = 1 - i / count
      const where = along(mix(from, to, alongStep), left(axis), i % 2 ? -8 : 8)
      return <path key={i} d="M-9-3-2-7 8-3 10 4 1 8-9 5Z" transform={pose(where, heading(axis))}
        opacity={unit((q - alongStep + .38) * 3.4)} />
    })}
  </g>
}

function Cleared({ at: where, statuses, paint, q }: { at: EdgePoint; statuses: readonly string[]; paint: ArmorPaint; q: number }) {
  return <g transform={at(where)} fill="none" strokeLinecap="round">
    {statuses.map((status, i) => {
      const side = i % 2 ? -1 : 1
      return <g key={i} transform={`translate(${side * (30 + 32 * q)} ${-20 - 16 * q}) rotate(${side * (19 + q * 45)})`}>
        <path d={status === "short" ? "M-13-12-4-17 6-8m3-5 8 6-7 14m-17 1-7-4-2-7"
          : status === "dot" ? "M-12 9-7-12 0-5 7-14 13-2 9 12-5 13Z" : "M-13-8 4-13 15-4 8 11-12 8-5-2 9 2"}
          stroke={status === "dot" ? "#ffb895" : paint.accent} strokeWidth="2.6" strokeDasharray={q > .65 ? "5 4" : undefined} />
        <path d="M-7-9 9 10M-5 10 8-9" stroke={paint.light} strokeWidth="1.8" />
      </g>
    })}
  </g>
}

function PassiveMotion({ scene, layer }: { scene: Scene; layer: Layer }) {
  const { fx, beat, art, paint, to, t } = scene
  const q = ease(t), mode = beat.mode
  const contact = fx.contacts?.[0] ?? beat.receiver, endpoint = beat.landing ?? to
  const from = fx.from, facing = heading(direction(from, endpoint))
  const size = fx.rarity === "C" ? .68 : fx.rarity === "Prismatic" ? .97 : .81
  const mark = offset(contact, 19, 33)
  if (layer === "floor") return <>
    {["light", "needle", "lace", "echo", "dose", "strap", "mesh"].includes(art.motion) &&
      <Thread from={from} to={contact} paint={paint} bend={art.angle * .24} q={.30 + .70 * q}
        width={art.motion === "light" ? 3.6 : art.motion === "needle" ? 2.3 : 3} dashed={art.motion === "strap" && mode !== "consume"} />}
    {beat.partners?.map((partner, i) => <Thread key={i} from={partner} to={contact} paint={paint}
      bend={i % 2 ? -18 : 22} q={.35 + .65 * q} width={art.motion === "mesh" ? 3.9 : 2.6} />)}
    {art.motion === "step" && <Steps from={from} to={endpoint} paint={paint} q={q} />}
    {art.motion === "mesh" && fx.area && <Range area={fx.area} paint={paint} q={q} />}
  </>
  let shape
  switch (art.motion) {
    case "dose":
      shape = <path d={pulse} transform={pose(mark, facing + art.angle * .35, .68 + q * .40)}
        fill="none" stroke={paint.light} strokeWidth="3.3" />
      break
    case "seal":
      shape = <path d="M-34-10v-13h15m38 0h15v13m0 20v13H20m-40 0h-14V10M-21 8-9 2 1 10 12-4 24 2"
        transform={pose(mark, art.angle * .24, 1.13 - .24 * q)} fill="none" stroke={paint.accent} strokeWidth="3.2" />
      break
    case "bracket":
      shape = <Armor where={contact} angle={facing + 90} paint={paint} q={q} width={.83 + .18 * q} spread={mode === "consume" ? 1.55 : .65} />
      break
    case "gauge":
      shape = <g transform={pose(offset(contact, -7, 44), art.angle * .16, .72 + q * .29)} fill="none">
        <path d="M-36 8H36M-32 0V10m12-14v14m12-20v20M4 0v10m12-16v16m12-12v12" stroke={paint.accent} strokeWidth="2.8" />
        <path d={`M-34 5H${-34 + q * (44 + unit((beat.amount ?? 25) / 60) * 22)}`} stroke={paint.light} strokeWidth="4.1" />
      </g>
      break
    case "strap":
      shape = <path d="M-45 7-24-12 2-16 30-13 45 6 20 23-17 23ZM-23 5 19-3M-22 12 25 5"
        transform={pose(mark, facing + art.angle * .3, .63 + .43 * q)} fill={paint.metal} fillOpacity=".17" stroke={paint.light} strokeWidth="2.7" />
      break
    case "light":
      shape = <path d={arc(47 + q * 8, -53, 35) + arc(54 + q * 8, -28, 26) + "M41-10 56 0 40 12"}
        transform={pose(contact, (mode === "stance" ? facing + 180 : facing) + art.angle * .10)}
        fill="none" stroke={paint.light} strokeWidth="3.3" />
      break
    case "wing":
      shape = <path d="M-46 11-33-17-12-26-19-2 0-13 21-4 14-25 34-16 47 10 22 24 0 9-24 24Z"
        transform={pose(contact, facing * .34 + art.angle * .21, .68 + .43 * q)} fill={paint.metal} fillOpacity=".17" stroke={paint.accent} strokeWidth="2.7" />
      break
    case "needle":
      shape = <path d="M-42 3-17-14 25-8 38 2 22 11-19 14ZM-16-9l-3 20m14-17v16m12-13v10"
        transform={pose(mark, facing + art.angle * .18, .67 + .42 * q)} fill={paint.metal} fillOpacity=".15" stroke={paint.light} strokeWidth="2.5" />
      break
    case "step":
      shape = <path d="M-37 13-23-9-12 3 2-19 16-6 33-21M-18 19-6 14 4 22 26 8"
        transform={pose(mark, facing + art.angle * .14, .70 + .39 * q)} fill="none" stroke={paint.accent} strokeWidth="3.1" />
      break
    case "echo":
      shape = <path d={arc(43 + q * 9, 11, 147) + arc(56 + q * 9, 188, 293) + "M-17 12 0-5 17 9"}
        transform={pose(contact, facing * .32 + art.angle * .21)} fill="none" stroke={paint.accent} strokeWidth="3.2" />
      break
    case "lace":
      shape = <path d="M-46 3Q-25-21-11-3T20-4 46-3M-44 14Q-25 37-7 16T21 15 43 13"
        transform={pose(mark, facing + art.angle * .30, .65 + q * .45)} fill="none" stroke={paint.light} strokeWidth="3.0" />
      break
    case "chart":
      shape = <path d="M-36-16H13l24 15v19H-36Zm11 8H10m-35 11H24m-49 8H15"
        transform={pose(mark, art.angle * .24, .74 + .36 * q)} fill={paint.ink} fillOpacity=".50" stroke={paint.light} strokeWidth="2.6" />
      break
    case "notch":
      shape = <path d="M-38 4-22-15-6 4 8-16 22 2 40-16M-27 16-16 5-6 14 9 4 27 12"
        transform={pose(mark, facing + art.angle * .14, .74 + .37 * q)} fill="none" stroke={paint.light} strokeWidth="3.5" />
      break
    case "mesh":
      shape = <path d="M-41-1-23-24 19-26 43-1 21 24-22 24ZM-23-24 21 24M19-26-22 24M-41-1 43-1"
        transform={pose(mark, art.angle * .31, .69 + q * .42)} fill={paint.metal} fillOpacity=".12" stroke={paint.light} strokeWidth="2.8" />
      break
    case "petal":
      shape = <g transform={pose(contact, art.angle * .36 + q * 19)}>
        {array(4).map(i => <path key={i} transform={`rotate(${i * 90}) translate(0 ${-30 - q * 19})`}
          d="M-15 3-4-15 8-12 17 5 4 13Z" fill={paint.metal} fillOpacity=".17"
          stroke={fx.rarity === "Prismatic" ? spectrum[i] : paint.light} strokeWidth="2.8" />)}
      </g>
      break
  }
  return <>
    {shape}
    {!!beat.statuses?.length && <Cleared at={contact} statuses={beat.statuses} paint={paint} q={q} />}
    <Seal at={mark} art={art} paint={paint} size={size + .14 * q} angle={art.angle * .42 + (1 - q) * 20} />
    {fx.contacts?.slice(1).map((other, i) => <g key={i}>
      {art.motion === "petal" && <path d={arc(36 + q * 14, -111, 70)} transform={pose(other, i * 36)}
        fill="none" stroke={fx.rarity === "Prismatic" ? spectrum[i + 1] : paint.accent} strokeWidth="3.3" />}
      <Seal at={offset(other, 15, 33)} art={art} paint={paint} size={size * .83} angle={art.angle * -.39} />
    </g>)}
  </>
}

function GoldMotion({ scene, layer }: { scene: Scene; layer: Layer }) {
  const { fx, beat, art, paint, to, t } = scene
  const q = ease(t), from = fx.from, travel = beat.mode === "travel", front = layer === "front"
  const angle = heading(direction(from, to)), contact = fx.contacts?.[0] ?? beat.receiver
  const badge = (where: EdgePoint, size = .92, tilt = art.angle * .39) => <Seal at={offset(where, 15, 32)} art={art} paint={paint} size={size} angle={tilt} />
  const transfer = (bend: number, width: number, color?: string) => <Thread from={from} to={to} paint={paint} bend={bend}
    width={width} q={travel ? q : 1} color={color} />
  switch (art.pair) {
    case "shoe":
      return front ? <>{badge(to, .81)}<Armor where={to} angle={angle + 90} paint={paint} q={q} width={.84} /></>
        : <Steps from={along(to, direction(from, to), -58)} to={to} paint={paint} q={q} />
    case "shards":
      return front ? <g transform={pose(contact, angle + 45)} fill={paint.metal} fillOpacity=".24" stroke={paint.light} strokeWidth="2.5">
        {array(5).map(i => <path key={i} transform={`rotate(${i * 72}) translate(0 ${-22 - 34 * q})`} d="M-10 4-3-14 7-7 13 9-5 11Z" />)}
        <Seal at={{ x: 0, y: 32 }} art={art} paint={paint} size={.77 + .27 * q} angle={-22} />
      </g> : <Thread from={from} to={contact} paint={paint} bend={-32} width={2.5} q={q} dashed />
    case "unwind":
      return front ? travel ? badge(stitch(from, to, -43, q).head, .64)
        : <><Cleared at={to} statuses={beat.statuses ?? ["slow"]} paint={paint} q={q} />{badge(to)}</>
        : <>{transfer(-43, 4.7)}<Thread from={from} to={to} paint={paint} q={travel ? q : 1} bend={18} width={2.1} dashed /></>
    case "wedge":
      return front ? <><Armor where={contact} angle={angle - 90} paint={paint} q={q} width={1.01} spread={1.40} />{badge(contact, .82)}</>
        : <path d="M-46 8-21-17 0 9 22-17 46 8" transform={pose(contact, angle + 90)} fill="none" stroke={paint.accent} strokeWidth="3.3" />
    case "heartGuard":
      return front ? <><path d={pulse} transform={pose(offset(contact, 0, 50), angle * .20, 1.14 + .14 * q)}
        fill="none" stroke={paint.light} strokeWidth="3.9" />{badge(contact, .84)}</> :
        <path d={arc(48 + q * 10, 15, 149) + arc(48 + q * 10, 199, 326)} transform={pose(contact, angle)}
          fill="none" stroke={paint.metal} strokeWidth="3.9" />
    case "landingRelay":
      return front ? badge(travel ? stitch(from, to, -33, q).head : to, travel ? .64 : 1.04, angle * .77)
        : <>{transfer(-33, 4.2)}<Steps from={from} to={to} paint={paint} q={travel ? q : 1} /></>
    case "rebound":
      return front ? badge(travel ? from : contact, 1.01, art.angle * .31) : <>
        <Range area={fx.area} paint={paint} q={q} reverse={travel} />
        {fx.contacts?.map((where, i) => <Thread key={i} from={where} to={beat.landings?.[i] ?? where} paint={paint} q={q} width={5} />)}
      </>
    case "cleanBrace":
      return front ? <><Armor where={contact} angle={angle + 90} paint={paint} q={q} width={.92} spread={.98} />{badge(contact, .94)}</>
        : <path d={arc(57, 18, 164) + arc(49, 26, 154)} transform={pose(contact, angle * .28)}
          fill="none" stroke={paint.accent} strokeWidth="3.3" strokeDasharray={beat.mode === "consume" ? "7 5" : undefined} />
    case "secondPage":
      return front ? <g transform={pose(offset(contact, 23, 30), -19 + q * 27)}>
        <path d={`M-42-20H-4L${11 + q * 26} -17V18L-4 22H-42ZM-4-20v42m-27-30h18m-18 10h18`}
          fill={paint.ink} fillOpacity=".74" stroke={paint.light} strokeWidth="3.2" />
        <Seal at={{ x: 16, y: 7 }} art={art} paint={paint} size={.59} angle={25} />
      </g> : <Thread from={from} to={to} paint={paint} q={q} width={2.6} bend={28} dashed />
    case "sideDoor":
      return front ? <g transform={pose(travel ? stitch(from, to, 37, q).head : offset(to, 11, 26), angle * .57)}>
        <path d={`M-31 22V-25h15m32 0h15v47M-16 -19L${-16 - q * 17} -9v30l${q * 17} -9M16 -19L${16 + q * 17} -9v30l${-q * 17} -9`}
          fill="none" stroke={paint.light} strokeWidth="3.2" />
        <Seal at={{ x: 0, y: 4 }} art={art} paint={paint} size={.71} />
      </g> : transfer(37, 5.1)
    case "saveHalo":
      return front ? <>{badge(travel ? from : to, .96)}{fx.contacts?.slice(1).map((where, i) => <g key={i}>{badge(where, .76)}</g>)}</>
        : <Range area={fx.area} paint={paint} q={q} petals reverse={travel} />
    case "secondShell":
      return front ? <><Armor where={contact} paint={paint} angle={angle + 90} q={q} width={1.16} spread={beat.mode === "consume" ? 1.7 : .65} />
        {badge(contact, .91)}</> : <path d={arc(54 + q * 7, -56, 44) + arc(66 + q * 9, -41, 31)} transform={pose(contact, angle + 180)}
        fill="none" stroke={paint.accent} strokeWidth="3.7" />
    case "returnDesk": {
      const border = beat.anchor ?? from
      if (travel) return front ? badge(stitch(from, to, -48, q).head, .72, angle) : <>
        {transfer(-48, 6.7, spectrum[3])}
        <Thread from={from} to={to} paint={paint} q={q} bend={26} width={3.9} color={spectrum[1]} />
      </>
      return front ? <>{badge(to, 1.10)}{beat.mode === "consume" && <path d="M-36 0H36M0-27V27m-17-44 17 17 17-17"
        transform={pose(border, heading(outward(border)) + 90, .73 + .41 * q)} stroke={paint.light} strokeWidth="3.4" fill="none" />}</>
        : <>{transfer(-23, 4.8, spectrum[2])}
          {beat.mode === "consume" && <path d={arc(31 + q * 19, -83, 75) + arc(42 + q * 19, -66, 55)}
            transform={pose(border, heading(outward(border)) + 180)} stroke={spectrum[3]} strokeWidth="4.4" fill="none" />}
        </>
    }
    case "stayLine":
      return front ? <>{badge(contact, 1.09)}<Armor where={contact} angle={angle + 90} paint={paint} q={q} width={1.16} spread={1.21} /></>
        : <>{transfer(-41, 6.0, spectrum[3])}<Thread from={from} to={to} paint={paint} q={q} bend={25} width={3.6} color={spectrum[1]} /></>
    default: return null
  }
}

export function EdgeHealerTraits({ battle, layer }: { battle: EdgeBattle; layer: Layer }) {
  return <g aria-hidden="true" pointerEvents="none">
    {battle.runtime.effects.map(fx => {
      const beat = fx.passive, art = healerTraitArt(fx.skill)
      if (!beat || !art || battle.time < fx.start || battle.time >= fx.end) return null
      const t = unit((battle.time - fx.start) / (fx.end - fx.start))
      const target = beat.mode === "travel" ? unitOf(battle, fx.target) : undefined
      if (target && !target.hp) return null
      const scene = { fx, beat, art, t, to: target ?? fx.to, paint: armorPaint[fx.rarity] }
      return <g key={fx.id} opacity={beat.mode === "travel" ? .93 : 1 - t ** 1.42}
        data-healer-trait={fx.skill} data-healer-trait-mode={beat.mode}>
        {art.pair ? <GoldMotion scene={scene} layer={layer} /> : <PassiveMotion scene={scene} layer={layer} />}
      </g>
    })}
    {healerTraitReadiness(battle).map(({ id, unit: holder, kind, until, partners, movingFaster }) => {
      const art = healerTraitArt(id)
      if (!art) return null
      const paint = armorPaint[id.split("/")[1] as Rarity], q = .5 + .5 * Math.sin(battle.time * 6 + holder.x * .02)
      const alpha = until === undefined ? 1 : unit((until - battle.time) / .23)
      const crossing = id === "healer/Prismatic/G1" && isOutside(holder) ? inside(holder) : undefined
      return <g key={id + "@" + holder.id} data-healer-trait-ready={id} opacity={alpha * (kind === "stance" ? .60 : .76)}>
        {layer === "floor" ? <>
          {partners?.map((partner, i) => <Thread key={i} from={partner} to={holder} paint={paint} bend={15} width={2} dashed />)}
          {movingFaster && holder.move && <path d="M-29-8-17 0-29 8M-43-9-32 0-43 9M-58-10-47 0-58 10"
            transform={pose(holder, heading(direction(holder, holder.move)), .83 + q * .22)}
            fill="none" stroke={paint.light} strokeWidth="3.1" />}
          {crossing && <>
            <Thread from={holder} to={crossing} paint={paint} width={2.5} dashed color={spectrum[3]} />
            <path d="M-11-36L0-28l11-8M-11 36L0 28l11 8M0-19v38"
              transform={pose(crossing, heading(outward(crossing)), .88 + .18 * q)}
              fill="none" stroke={spectrum[3]} strokeWidth="3.1" />
          </>}
        </> : <>
          <Seal at={offset(holder, 44, 11 + 4 * q)} art={art} paint={paint} size={.48} angle={art.angle * .24} />
          {kind === "shield" && <path d={arc(48, -68, 11)} transform={at(holder)} fill="none" stroke={paint.accent} strokeWidth="2.6" />}
        </>}
      </g>
    })}
  </g>
}
