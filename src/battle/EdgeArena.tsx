import { combatHasRole, equippedCombatRoles } from "./combatRules"
import { memo, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from "react"
import { RiArrowLeftLine } from "@remixicon/react"
import { JOB_LABEL } from "@/card/cultivation"

import { EDGE_TINT as colors, EdgeEffects, tokenFeedback } from "./EdgeEffects"
import { EdgeSkillEffects, FieldSignature } from "./EdgeSkillEffects"
import { EdgeRangerEffects, RangerField, RangerGoldBuffs, RangerWatchMarks } from "./EdgeRangerEffects"
import { EdgeRangerPassives } from "./EdgeRangerPassives"
import { EdgePreviewFeedback } from "./EdgePreviewFeedback"
import { EdgeSummons } from "./EdgeSummons"
import { EdgeSummonEffects } from "./EdgeSummonEffects"
import { EdgeBulwarkEffects } from "./EdgeBulwarkEffects"
import { BulwarkField, EdgeBulwarkReadiness } from "./EdgeBulwarkFields"
import { BulwarkTraitField, EdgeBulwarkTraits } from "./EdgeBulwarkTraits"
import { EdgeSummonTraits } from "./EdgeSummonTraits"
import { EdgeWardenEffects } from "./EdgeWardenEffects"
import { EdgeWardenField, EdgeWardenReadiness } from "./EdgeWardenFields"
import { EdgeWardenTraitField, EdgeWardenTraits } from "./EdgeWardenTraits"
import { EdgeBerserkerEffects } from "./EdgeBerserkerEffects"
import { EdgeBerserkerTraits } from "./EdgeBerserkerTraits"
import { EdgePaladinEffects, EdgePaladinField } from "./EdgePaladinEffects"
import { EdgePaladinTraitField, EdgePaladinTraits } from "./EdgePaladinTraits"
import { EdgeSpellbreakerEffects, EdgeSpellbreakerField } from "./EdgeSpellbreakerEffects"
import { EdgeWarlockEffects, EdgeWarlockField } from "./EdgeWarlockEffects"
import { EdgeLifebringerEffects, EdgeLifebringerField } from "./EdgeLifebringerEffects"
import { EdgeBinderEffects, EdgeBinderField } from "./EdgeBinderEffects"
import { EdgeDancerEffects, EdgeDancerField } from "./EdgeDancerEffects"
import { EdgeDancerTraitField, EdgeDancerTraits } from "./EdgeDancerTraits"
import { EdgeHealerEffects, EdgeHealerField } from "./EdgeHealerEffects"
import { EdgeBardEffects, EdgeBardField } from "./EdgeBardEffects"
import { EdgeBardTraitField, EdgeBardTraits } from "./EdgeBardTraits"
import { EdgeHealerTraits } from "./EdgeHealerTraits"
import { bardChoreography } from "./edgeSkills/bardChoreo"
import { EdgeBinderTraits, EdgeBinderTraitField } from "./EdgeBinderTraits"
import { EdgeLifebringerTraits, EdgeLifebringerTraitField } from "./EdgeLifebringerTraits"
import { EdgeWarlockTraits, EdgeWarlockTraitField } from "./EdgeWarlockTraits"
import { EdgeSpellbreakerTraitField, EdgeSpellbreakerTraits } from "./EdgeSpellbreakerTraits"
import { EdgeAssassinEffects, EdgeAssassinField } from "./EdgeAssassinEffects"
import { EdgeAssassinTraitField, EdgeAssassinTraits } from "./EdgeAssassinTraits"
import {
  actionProblem, activeFor, BOARD, CHARGE, COOLDOWN, createEdgeBattle, edgeDistance, EXILE, FIELD, isOutside, issueEdgeOrder,
  moveEdgeFighter, moveLanding, moveProblem, orderPreview, snapshotEdgeBattle, SPARRING_STEP, stepEdgeBattle,
  type EdgeBattle, type EdgeFighter, type EdgeOrder, type EdgePoint, type EdgeUnit, type EdgeUnitId, type SkillOrder,
} from "./edgeBattle"
import type { EdgeInputCard } from "./edgeSkills/catalog"
import { settleCultivation, startCultivation } from "./cultivationApi"
import { areaPath, type EdgeArea } from "./edgeSkills/geometry"
import { dancerChoreography, type DancerPath } from "./edgeSkills/dancerChoreo"
import { rangerChoreography } from "./edgeSkills/rangerChoreo"
import { bulwarkChoreography } from "./edgeSkills/bulwarkChoreo"
import { bulwarkTraitArt } from "./edgeSkills/bulwarkTraits"
import { wardenChoreography } from "./edgeSkills/wardenChoreo"
import { paladinChoreography } from "./edgeSkills/paladinChoreo"
import { paladinTraitArt } from "./edgeSkills/paladinTraits"
import { assassinChoreography } from "./edgeSkills/assassinChoreo"
import { warlockChoreography } from "./edgeSkills/warlockChoreo"
import { lifebringerChoreography } from "./edgeSkills/lifebringerChoreo"
import { spellbreakerChoreography } from "./edgeSkills/spellbreakerChoreo"
import { wardenTraitArt } from "./edgeSkills/wardenTraits"
import { passiveCooldown } from "./edgeSkills/rangerPassives"
import { attackRange, glideField, previewSkillAreas, previewSkillDisplacements, statusNames } from "./edgeSkills/runtime"
import { BULWARK_COVER, EDGE_ROLE_DETAILS, SPARRING_HEALING, WARDEN_CONTROL, hasHealCut, sparringHealingMultiplier } from "./edgeSkills/roles"
import { battleUnits, isFighter, sideOf, type EdgeSide } from "./edgeSkills/state"
import { portalRoute } from "./edgeSkills/summons"
import "./edge-arena.css"

const FIGHTER_RADIUS = 36
const BOSS_RADIUS = 46
const number = new Intl.NumberFormat("zh-CN")
const sideNames = { ally: "蓝方", enemy: "粉方" }
const sideTints = { ally: "#a3ceff", enemy: "#ffa1c5" }

function fighterFor(battle: EdgeBattle, uid: number | null) {
  return battle.team.find((fighter) => fighter.hp && fighter.card.uid === uid) ?? battle.team.find((fighter) => fighter.hp)
}

function unitAt(battle: EdgeBattle, point: EdgePoint, side?: "ally" | "enemy") {
  const units = side === "ally" ? battle.team : side === "enemy" ? [battle.boss] : [...battle.team, battle.boss]
  return units.reduce<typeof units[number] | null>((best, unit) => {
    const gap = edgeDistance(unit, point)
    if (!unit.hp || gap > ("card" in unit ? FIGHTER_RADIUS : BOSS_RADIUS) * 1.28) return best
    return best && edgeDistance(best, point) <= gap ? best : unit
  }, null)
}

function boardPoint(event: PointerEvent<SVGSVGElement>): EdgePoint | null {
  const matrix = event.currentTarget.getScreenCTM()
  return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null
}

function cooldown(at: number, now: number) {
  return at > now ? (Math.ceil((at - now) * 10) / 10).toFixed(1) + "s" : "就绪"
}

function recastFill(at: number, now: number, duration: number) {
  return Math.max(0, Math.min(1, 1 - (at - now) / duration))
}

function readyLight(at: number, now: number) {
  return at > 0 && now >= at ? Math.max(0, 1 - (now - at) / 0.58) : 0
}

function Meter({ unit, label }: { unit: { hp: number; maxHp: number }; label: string }) {
  return <progress className="edge-meter" value={unit.hp} max={unit.maxHp} aria-label={label} />
}

function Fill({ value }: { value: number }) {
  return <span className="edge-fill" aria-hidden="true"><i style={{ transform: "scaleX(" + value + ")" }} /></span>
}

function Recast({ label, value, fill, ready, pulse = false }: {
  label: string; value: string; fill: number; ready: boolean; pulse?: boolean
}) {
  return (
    <div className="edge-recast" data-ready={ready} data-pulse={pulse}>
      <span>{label}</span><b>{value}</b>
      <Fill value={fill} />
    </div>
  )
}

function Token({ unit, selected, battle, canvas }: {
  unit: EdgeUnit
  selected: boolean
  battle: EdgeBattle
  canvas: string
}) {
  const card = isFighter(unit) ? unit.card : null
  const radius = card ? FIGHTER_RADIUS : BOSS_RADIUS
  const name = card?.name ?? (battle.preview ? (unit.id === "boss" ? "标靶" : "") : "谱面幽灵")
  const side = battle.sparring ? sideOf(battle, unit.id) : undefined
  const tint = side ? sideTints[side] : card ? colors[card.job] : "#ff789f"
  const { time } = battle
  const out = isOutside(unit)
  const wounded = unit.hp > 0 && hasHealCut(battle, unit)
  const suppressed = unit.hp > 0 && battle.runtime.buffs.some((buff) =>
    buff.target === unit.id && buff.kind === "slow" && buff.style === WARDEN_CONTROL.style && buff.until > time)
  const clip = card ? canvas + "-portrait-" + card.uid : undefined
  const fill = recastFill(unit.actionAt, time, unit.actionCooldown)
  const ready = unit.hp ? readyLight(unit.actionAt, time) : 0
  const fx = tokenFeedback(battle, unit.id)
  const cursor = radius + 13
  const marked = unit.hp > 0 && battle.runtime.watches.some((watch) => watch.target === unit.id && watch.until > time && watch.uses > 0)
  const veiled = unit.hp > 0 && battle.runtime.buffs.some((buff) => buff.target === unit.id && buff.kind === "phase" && buff.until > time)
  const plannedRecovery = unit.hp > 0 ? battle.runtime.effects.filter(effect => effect.target === unit.id &&
    (effect.lifebringer?.kind === "chronowheel" || effect.lifebringer?.kind === "chronoPlan") && effect.end > time)
    .reduce((sum, effect) => sum + (effect.lifebringer?.amount ?? 0), 0) : 0
  const recoveryWidth = radius * 2 * Math.min(unit.maxHp - unit.hp, plannedRecovery) / unit.maxHp
  return (
    <g className="edge-token" data-side={side} transform={"translate(" + unit.x + " " + unit.y + ")"} opacity={unit.hp ? 1 : 0.28}>
      {selected && (
        <g className="edge-selection" stroke={tint} fill="none">
          <circle r={radius + 22} fill={tint} fillOpacity="0.12" strokeOpacity="0.44" strokeWidth="2.5" strokeDasharray="2 9" />
          {[0, 90, 180, 270].map((angle) => (
            <path key={angle} transform={"rotate(" + angle + ")"} strokeWidth="4" strokeLinecap="round"
              d={`M${-cursor} ${-cursor + 17}V${-cursor}h17`} />
          ))}
          <path d={`M-8 ${-cursor - 14}H8L0 ${-cursor - 4}Z`} fill={tint} stroke="none" />
        </g>
      )}
      {unit.guardUntil > time && <circle r={radius + 27} fill="none" stroke="#ffe2f1" strokeWidth="2" strokeDasharray="5 7" />}
      {unit.shieldUntil > time && unit.shield > 0 && <circle r={radius + 14} fill="#9dd9ff16" stroke="#9dd9ff" strokeWidth="2.5" />}
      {unit.hp > 0 && fill < 1 && (
        <g className="edge-token__recast" fill="none" strokeWidth="4" strokeLinecap="round" transform="rotate(-90)">
          <circle r={radius + 9} stroke="#171122" />
          <circle r={radius + 9} stroke={tint} pathLength={100} strokeDasharray="100" strokeDashoffset={100 * (1 - fill)} />
        </g>
      )}
      {ready > 0 && (
        <g className="edge-token__ready" fill="none" stroke={tint} opacity={ready}>
          <circle r={radius + 9 + (1 - ready) * 36} strokeWidth={2 + ready * 3} />
          <circle r={radius + 9 + (1 - ready) * 21} stroke="#fff0f8" strokeWidth="2" strokeDasharray="8 7" />
        </g>
      )}
      <g className="edge-token__body" opacity={veiled ? .46 : 1} style={{ "--edge-fx-x": fx.x + "px", "--edge-fx-y": fx.y + "px" } as CSSProperties}>
        <rect x={-radius - 4} y={-radius - 4} width={radius * 2 + 8} height={radius * 2 + 8} rx="13" fill="#150d22" />
        <rect x={-radius} y={-radius} width={radius * 2} height={radius * 2} rx="10" fill={card ? "#261a33" : `url(#${canvas}-boss)`} />
        {card?.art && (
          <>
            <clipPath id={clip}><rect x={-radius + 2} y={-radius + 2} width={radius * 2 - 4} height={radius * 2 - 4} rx="8" /></clipPath>
            <image x={-radius} y={-radius} width={radius * 2} height={radius * 2} href={card.art} preserveAspectRatio="xMidYMid slice" clipPath={"url(#" + clip + ")"} />
          </>
        )}
        {card && !card.art && <text y="10" fill={tint} className="edge-token__initial">{Array.from(card.name)[0]}</text>}
        {!card && battle.preview && (
          <g fill="none" stroke={tint} strokeWidth="3">
            <circle r="24" /><circle r="10" />
            <path d="M-31 0H-16M16 0H31M0-31V-16M0 16V31" />
          </g>
        )}
        {!card && !battle.preview && (
          <g className="edge-token__mask" strokeLinejoin="round">
            <path d="M-31-23-14-15 14-15 31-23 25 15 0 30-25 15Z" fill="#27142f" stroke={tint} strokeWidth="3" />
            <path d="M-20-3-5 3-13 10Z M20-3 5 3 13 10Z" fill="#ffd2e2" />
            <path d="M-5 17H5" stroke={tint} strokeWidth="2.5" />
          </g>
        )}
        <rect x={-radius} y={-radius} width={radius * 2} height={radius * 2} rx="10" fill="none" stroke={out ? "#ff789e" : tint} strokeWidth={selected ? 3 : 2.3} />
        {(fx.hitLight > 0 || fx.castLight > 0) && (
          <rect className="edge-token__flash" x={-radius} y={-radius} width={radius * 2} height={radius * 2} rx="10"
            fill={fx.tint} fillOpacity={fx.hitLight * 0.58 + fx.castLight * 0.12}
            stroke="#fff5fb" strokeOpacity={Math.max(fx.hitLight, fx.castLight)} strokeWidth="5" />
        )}
      </g>
      <rect x={-radius} y={radius + 8} width={radius * 2} height="6" rx="3" fill="#110d18" />
      {recoveryWidth > 0 && <rect x={-radius + radius * 2 * unit.hp / unit.maxHp} y={radius + 8}
        width={recoveryWidth} height="6" rx="2" fill="#f5d3ff" fillOpacity=".63" />}
      <rect x={-radius} y={radius + 8} width={radius * 2 * unit.hp / unit.maxHp} height="6" rx="3" fill={tint} />
      {marked && <path data-edge-mark="" transform={`translate(${radius + 7} ${-radius - 6})`}
        d="M0 -9 9 0 0 9 -9 0Z" fill="#fbe0a9" stroke="#432c56" strokeWidth="2.5" />}
      {name && <text y={radius + 36}>{name.length > 18 ? name.slice(0, 17) + "…" : name}</text>}
      {out && unit.hp > 0 && <text className="edge-token__out" y={-radius - (selected ? 36 : 16)}>出界</text>}
      {(wounded || suppressed) && (
        <text className={wounded ? "edge-token__wound" : "edge-token__suppressed"} y={radius + 54}>
          {[wounded ? "重伤" : "", suppressed ? "压制" : ""].filter(Boolean).join(" · ")}
        </text>
      )}
      {battle.preview && <EdgePreviewFeedback battle={battle} unit={unit} radius={radius} />}
    </g>
  )
}

function Route({ from, to, tint, path }: { from: EdgePoint; to: EdgePoint; tint: string; path?: DancerPath }) {
  return (
    <g fill="none" stroke={tint} strokeWidth="2.6">
      {path ? <polyline points={path.points.map(p => p.x + "," + p.y).join(" ")} strokeDasharray="5 8" />
        : <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} strokeDasharray="5 8" />}
      <circle cx={to.x} cy={to.y} r="10" />
    </g>
  )
}

function AreaOutline({ area, tint, fill, dashed = false }: { area: EdgeArea; tint: string; fill: number; dashed?: boolean }) {
  return area.parts.map((part, i) => (
    <path key={i} d={areaPath({ center: area.center, parts: [part] })} fill={tint} fillOpacity={fill}
      fillRule="evenodd" stroke={tint} strokeWidth={dashed ? 2 : 3.5} strokeDasharray={dashed ? "11 7" : undefined} />
  ))
}

function SkillAreas({ battle }: { battle: EdgeBattle }) {
  return (
    <g className="edge-skill-areas" aria-hidden="true">
      {battle.runtime.fields.map((field) => {
        const id = field.gold ? field.cast.signature?.id : !field.derived ? field.cast.skill?.id : undefined
        if (field.gold && bulwarkTraitArt(id)) return <BulwarkTraitField key={field.id} field={field} battle={battle} />
        if (field.gold && wardenTraitArt(id)) return <EdgeWardenTraitField key={field.id} field={field} battle={battle} />
        if (field.gold && paladinTraitArt(id)) return <EdgePaladinTraitField key={field.id} field={field} battle={battle} />
        if (field.cast.signature?.id === "spellbreaker/Prismatic/P6") return <EdgeSpellbreakerTraitField key={field.id} field={field} battle={battle} />
        if (field.cast.signature?.id === "assassin/C/G2") return <EdgeAssassinTraitField key={field.id} field={field} battle={battle} />
        if (field.cast.signature?.id === "warlock/L/G1" || field.cast.signature?.id === "warlock/Prismatic/G1") return <EdgeWarlockTraitField key={field.id} field={field} battle={battle} />
        if (field.cast.signature?.id === "lifebringer/C/G2" || field.cast.signature?.id === "lifebringer/UC/G1")
          return <EdgeLifebringerTraitField key={field.id} field={field} battle={battle} />
        if (field.cast.signature?.id === "binder/C/G2") return <EdgeBinderTraitField key={field.id} field={field} battle={battle} />
        if (id === "dancer/C/G2" || id === "dancer/Radiant/G1") return <EdgeDancerTraitField key={field.id} field={field} battle={battle} />
        if (id === "healer/L/A5") return <EdgeHealerField key={field.id} field={field} battle={battle} />
        if (id === "bard/E/G2" || id === "bard/Prismatic/G2") return <EdgeBardTraitField key={field.id} field={field} battle={battle} />
        if (bardChoreography(id)) return <EdgeBardField key={field.id} field={field} battle={battle} />
        if (id && rangerChoreography(id)) {
          return <RangerField key={field.id} field={field} battle={battle} skill={id} />
        }
        const actor = battle.team.find(({ id }) => id === field.cast.owner)
        if (actor && bulwarkChoreography(id)) return <BulwarkField key={field.id} field={field} battle={battle} rarity={actor.card.rarity} />
        if (actor && wardenChoreography(id)) return <EdgeWardenField key={field.id} field={field} battle={battle} rarity={actor.card.rarity} />
        if (actor && paladinChoreography(id)) return <EdgePaladinField key={field.id} field={field} battle={battle} rarity={actor.card.rarity} />
        if (actor && spellbreakerChoreography(id)) return <EdgeSpellbreakerField key={field.id} field={field} battle={battle} />
        if (actor && assassinChoreography(id)) return <EdgeAssassinField key={field.id} field={field} battle={battle} />
        if (actor && warlockChoreography(id)) return <EdgeWarlockField key={field.id} field={field} battle={battle} />
        if (actor && lifebringerChoreography(id)) return <EdgeLifebringerField key={field.id} field={field} battle={battle} />
        if (id?.startsWith("binder/") && !field.derived && !field.cast.signature) return <EdgeBinderField key={field.id} field={field} battle={battle} />
        if (dancerChoreography(id) && !field.derived && !field.cast.signature) return <EdgeDancerField key={field.id} field={field} battle={battle} />
        const summon = !!field.cast.summon && !field.derived
        const tint = field.mode === "guard" || field.mode === "wall" ? "#ffdf9c" : summon ? "#d0bbff" : "#b9a9ef"
        const mark = field.gold ? actor?.gold?.artwork.end : field.cast.signature?.mark ?? field.cast.skill?.artwork.end
        return <g key={field.id} opacity={.62}>
          <AreaOutline area={field.area} tint={tint} fill={.1} dashed />
          {mark && !summon && <FieldSignature field={field} mark={mark} battle={battle} />}
        </g>
      })}
      {battle.runtime.visuals.map((effect) => {
        if (effect.custom) return null
        const progress = Math.max(0, Math.min(1, (battle.time - effect.time) / (effect.until - effect.time)))
        const active = effect.phase === "impact"
        const star = effect.area.star
        const tint = effect.gold ? "#ffda96" : star ? "#f6ddff" : effect.effect === "heal" ? "#a9efd6"
          : effect.effect === "shield" ? "#9dd9ff" : "#fbb0d9"
        return <g key={effect.id} data-effect-phase={effect.phase} data-shape={star ? "star" : "area"}
          opacity={active ? 1 - progress : .67 + .33 * progress}>
          <AreaOutline area={effect.area} tint={tint} fill={active ? .21 * (1 - progress) : .09} dashed={!active} />
        </g>
      })}
    </g>
  )
}

function aimSide(actor: EdgeFighter, order: SkillOrder) {
  const mode = activeFor(actor, order).aim.mode
  return mode === "ally" || mode === "other" ? "ally" : mode === "enemy" || mode === "outside" ? "enemy" : undefined
}

function AimPreview({ battle, actor, pointer, aiming }: {
  battle: EdgeBattle; actor: EdgeFighter; pointer: EdgePoint | null; aiming: SkillOrder | null
}) {
  if (!pointer || battle.phase === "ready") return null
  const side = aiming ? aimSide(actor, aiming) : undefined
  const target = unitAt(battle, pointer, side)
  if (aiming) {
    const location = side ? target ?? pointer : pointer
    const preview = orderPreview(battle, actor, aiming, target, location)
    if ("error" in preview) return <text className="edge-caption" x={location.x} y={location.y - 54}>{preview.error}</text>
    const skill = activeFor(actor, aiming)
    const areas = previewSkillAreas(battle, actor, skill, location, target ?? undefined)
    const paths = previewSkillDisplacements(battle, actor, skill, location, target ?? undefined)
    return <g pointerEvents="none">
      {areas.map((area, i) => <AreaOutline key={i} area={area} tint={colors[actor.card.job]} fill={.12} dashed />)}
      <Route from={actor} to={location} tint={colors[actor.card.job]} />
      {paths.map(({ from, to, path }, i) => <Route key={i} from={from} to={to} path={path} tint={isOutside(to) ? "#ff8db7" : "#f7d2ec"} />)}
    </g>
  }
  const portalLanding = !actor.force && moveLanding(actor, pointer, battle)
  const portal = portalLanding && portalRoute(battle, portalLanding, actor.id)
  if (portal && portalLanding) return (
    <g pointerEvents="none">
      <Route from={actor} to={portalLanding} tint={moveProblem(battle, actor) ? "#a69abe50" : "#b4dcf4"} />
      <Route from={portal.entry} to={portal.out} tint="#d5bdff" />
    </g>
  )
  if (target === battle.boss) {
    const preview = orderPreview(battle, actor, "basic", target)
    if ("error" in preview) return <text className="edge-caption" x={target.x} y={target.y - ("card" in target ? FIGHTER_RADIUS : BOSS_RADIUS) - 16}>{preview.error}</text>
    const landing = preview.end
    if (!landing) return <Route from={actor} to={target} tint={colors[actor.card.job]} />
    if (edgeDistance(target, landing) < 3) return null
    const exits = !isOutside(target) && isOutside(landing)
    const label = exits ? "出界" : target.guardUntil > battle.time ? "击退 75%" : ""
    return (
      <g>
        <circle cx={target.x} cy={target.y} r={BOSS_RADIUS + 15} fill="none" stroke={colors[actor.card.job]} strokeWidth="3" strokeDasharray="18 8" />
        <Route from={target} to={landing} tint={exits ? "#ff8db7" : colors[actor.card.job]} />
        {preview.side && <Route from={landing} to={preview.side} tint="#ffda96" />}
        <circle cx={landing.x} cy={landing.y} r={BOSS_RADIUS} fill="none" stroke="#f6bddc70" strokeDasharray="4 5" />
        {label && <text className="edge-caption" x={landing.x} y={landing.y - 24}>{label}</text>}
      </g>
    )
  }
  if (target || actor.force) return null
  const landing = moveLanding(actor, pointer, battle)
  const onSlider = landing && glideField(battle, actor, pointer)
  return landing && edgeDistance(actor, landing) > 7
    ? <Route from={actor} to={landing} tint={moveProblem(battle, actor) ? "#a69abe50" : onSlider ? "#fbdef9" : "#b4dcf4"} />
    : null
}

const fieldWidth = FIELD.right - FIELD.left
const fieldHeight = FIELD.bottom - FIELD.top
const rim = `M0 0H${BOARD.width}V${BOARD.height}H0Z M${FIELD.left} ${FIELD.top}h${fieldWidth}v${fieldHeight}h${-fieldWidth}Z`
const corners = [
  { x: FIELD.left, y: FIELD.top, turn: 0 },
  { x: FIELD.right, y: FIELD.top, turn: 90 },
  { x: FIELD.right, y: FIELD.bottom, turn: 180 },
  { x: FIELD.left, y: FIELD.bottom, turn: 270 },
]

const SandboxFloor = memo(function SandboxFloor({ canvas }: { canvas: string }) {
  return (
    <g aria-hidden="true" className="edge-terrain">
      <defs>
        <linearGradient id={canvas + "-terrain"} x2="18%" y2="100%">
          <stop stopColor="#533743" />
          <stop offset="0.46" stopColor="#453747" />
          <stop offset="1" stopColor="#30364d" />
        </linearGradient>
        <radialGradient id={canvas + "-light"} cx="46%" cy="44%" r="66%">
          <stop stopColor="#cba596" stopOpacity="0.14" />
          <stop offset="1" stopColor="#201522" stopOpacity="0.25" />
        </radialGradient>
        <pattern id={canvas + "-grain"} width="83" height="71" patternUnits="userSpaceOnUse" patternTransform="rotate(-17)">
          <path d="M8 13h2m20 9h3m34-13h2m-18 27h4m-43 9h2m52 12h3m-44 7h2"
            stroke="#e3c1b9" strokeWidth="1.6" strokeLinecap="round" opacity="0.26" />
          <path d="M16 6h3m25 10h2m21 10h2m-40 14h3m-24 18h2m44 7h3"
            stroke="#171020" strokeWidth="2.4" strokeLinecap="round" opacity="0.38" />
        </pattern>
        <pattern id={canvas + "-survey"} x={FIELD.left} y={FIELD.top} width="154" height="144" patternUnits="userSpaceOnUse">
          <path d="M77 68v8m-4-4h8" stroke="#ead0dd" strokeWidth="2" opacity="0.24" />
        </pattern>
      </defs>
      <rect width={BOARD.width} height={BOARD.height} fill={`url(#${canvas}-terrain)`} />
      <rect width={BOARD.width} height={BOARD.height} fill={`url(#${canvas}-light)`} />
      <g fill="none" strokeWidth="2.4">
        <path fill="#b48290" fillOpacity="0.12" stroke="#c693a2" strokeOpacity="0.25"
          d="M-24 706C104 713 197 680 247 602C289 536 268 497 335 448C384 412 446 421 465 349C479 302 447 253 465 211C489 156 558 102 560-22H-24Z" />
        <path stroke="#d8a6af" strokeOpacity="0.2"
          d="M-15 649C134 654 192 606 213 539C236 467 245 438 309 407C366 379 408 379 420 319C429 268 400 228 430 175C455 130 508 77 512-16
             M-22 595C86 610 157 565 176 498C201 414 232 396 287 373C343 349 368 334 371 285C374 234 361 196 393 140C418 97 458 70 462-22
             M-17 535C103 551 130 482 148 435C164 386 210 361 262 335C300 316 330 277 321 227C313 179 341 133 373 91C398 60 405 22 411-10" />
        <path fill="#808bad" fillOpacity="0.13" stroke="#a4abc4" strokeOpacity="0.25"
          d="M813 1395C862 1334 835 1282 796 1206C756 1124 783 1072 852 1032C918 995 965 975 968 913C971 855 938 835 951 776C969 698 1056 686 1242 661V1395Z" />
        <path stroke="#adbad4" strokeOpacity="0.2"
          d="M866 1395C914 1325 877 1261 850 1195C820 1123 847 1092 905 1060C968 1025 1005 989 1013 922C1019 871 983 831 998 782C1016 724 1115 716 1240 709
             M920 1395C960 1322 934 1263 904 1200C871 1130 905 1103 953 1079C1017 1048 1050 997 1057 939C1063 882 1030 852 1045 803C1066 758 1140 761 1240 752
             M969 1395C1005 1334 987 1271 956 1210C926 1150 965 1119 1003 1096C1058 1063 1097 1003 1103 947C1109 900 1081 867 1095 829C1114 788 1188 796 1240 794" />
      </g>
      <rect width={BOARD.width} height={BOARD.height} fill={`url(#${canvas}-grain)`} />
      <path d={rim} fillRule="evenodd" fill="#1b1424" opacity="0.58" />
      <rect x={FIELD.left} y={FIELD.top} width={fieldWidth} height={fieldHeight} fill={`url(#${canvas}-survey)`}
        stroke="#d3b4cb" strokeOpacity="0.62" strokeWidth="2.5" />
      <g fill="none" stroke="#e6c5d6" strokeWidth="4" strokeOpacity="0.76">
        {corners.map(({ x, y, turn }) => (
          <path key={turn} d="M0 25V0H25" transform={`translate(${x} ${y}) rotate(${turn})`} />
        ))}
      </g>
    </g>
  )
})

function ChargeWarning({ from, to, fill, canvas }: { from: EdgePoint; to: EdgePoint; fill: number; canvas: string }) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI
  return (
    <g className="edge-charge-warning" transform={`translate(${from.x} ${from.y}) rotate(${angle})`}>
      <rect y={-CHARGE.halfWidth} width={CHARGE.reach} height={CHARGE.halfWidth * 2} fill="#e54e772c" />
      <rect y={-CHARGE.halfWidth} width={CHARGE.reach} height={CHARGE.halfWidth * 2} fill={`url(#${canvas}-charge)`} />
      <rect y={-CHARGE.halfWidth} width={CHARGE.reach * fill} height={CHARGE.halfWidth * 2} fill="#ff709842" />
      <rect y={-CHARGE.halfWidth} width={CHARGE.reach} height={CHARGE.halfWidth * 2} fill="none" stroke="#ff93b5" strokeWidth="3" strokeDasharray="11 7" />
      {[1, 2, 3].map((step) => (
        <path key={step} transform={`translate(${CHARGE.reach * step / 4} 0)`} d="M-8-13L8 0-8 13" fill="none"
          stroke={fill >= step / 4 ? "#fff0f6" : "#ff9bb9"} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      <line x1={CHARGE.reach * fill} x2={CHARGE.reach * fill} y1={-CHARGE.halfWidth} y2={CHARGE.halfWidth} stroke="#ffc7dc" strokeWidth="4" />
    </g>
  )
}

export function EdgeBoard({ battle, selected, viewBox, aiming = null, pointer = null, onPointer, onClick }: {
  battle: EdgeBattle
  selected?: EdgeFighter
  viewBox?: string
  aiming?: SkillOrder | null
  pointer?: EdgePoint | null
  onPointer?: (event: PointerEvent<SVGSVGElement>) => void
  onClick?: (event: PointerEvent<SVGSVGElement>) => void
}) {
  const canvas = "edge-" + useId()
  const units = battleUnits(battle)
  const occluders = battle.impacts.length ? units.filter(unit => unit.hp).map(unit => {
    const radius = isFighter(unit) ? FIGHTER_RADIUS : BOSS_RADIUS
    return { x: unit.x, y: unit.y + 14, width: radius * 2 + 18, height: radius * 2 + 48 }
  }) : []
  const telegraph = battle.telegraph
  const elapsed = telegraph ? Math.max(0, Math.min(1, 1 - (telegraph.until - battle.time) / CHARGE.windup)) : 0
  const range = onClick && selected && (aiming ? activeFor(selected, aiming).aim.range : attackRange(battle, selected))
  return (
    <svg className="edge-board" viewBox={viewBox ?? ("0 0 " + BOARD.width + " " + BOARD.height)}
      role="img" aria-label={battle.preview ? "技能预览战场" : "边线战场"} onPointerMove={onPointer} onPointerDown={onClick}>
      <defs>
        <pattern id={canvas + "-charge"} width="19" height="19" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
          <path d="M0 0V19" stroke="#f17c9e65" strokeWidth="4" />
        </pattern>
        <radialGradient id={canvas + "-boss"} cy="62%">
          <stop stopColor="#873c64" /><stop offset="1" stopColor="#3d2141" />
        </radialGradient>
      </defs>
      <SandboxFloor canvas={canvas} />
      <SkillAreas battle={battle} />
      <EdgeBulwarkEffects battle={battle} layer="floor" />
      <EdgeWardenEffects battle={battle} layer="floor" />
      <EdgeWardenTraits battle={battle} layer="floor" />
      <EdgeBerserkerEffects battle={battle} layer="floor" />
      <EdgeBerserkerTraits battle={battle} layer="floor" />
      <EdgePaladinEffects battle={battle} layer="floor" />
      <EdgePaladinTraits battle={battle} layer="floor" />
      <EdgeSpellbreakerTraits battle={battle} layer="floor" />
      <EdgeSpellbreakerEffects battle={battle} layer="floor" />
      <EdgeAssassinEffects battle={battle} layer="floor" />
      <EdgeWarlockEffects battle={battle} layer="floor" />
      <EdgeLifebringerEffects battle={battle} layer="floor" />
      <EdgeBinderEffects battle={battle} layer="floor" />
      <EdgeDancerEffects battle={battle} layer="floor" />
      <EdgeDancerTraits battle={battle} layer="floor" />
      <EdgeHealerEffects battle={battle} layer="floor" />
      <EdgeHealerTraits battle={battle} layer="floor" />
      <EdgeBardEffects battle={battle} layer="floor" />
      <EdgeBardTraits battle={battle} layer="floor" />
      <EdgeBinderTraits battle={battle} layer="floor" />
      <EdgeLifebringerTraits battle={battle} layer="floor" />
      <EdgeWarlockTraits battle={battle} layer="floor" />
      <EdgeAssassinTraits battle={battle} layer="floor" />
      <EdgeRangerEffects battle={battle} layer="floor" />
      <EdgeSummonEffects battle={battle} layer="floor" />
      {selected && range && Number.isFinite(range) ? (
        <circle className="edge-range" cx={selected.x} cy={selected.y} r={range}
          fill={colors[selected.card.job] + (aiming ? "20" : "10")} stroke={colors[selected.card.job] + (aiming ? "ed" : "8b")}
          strokeWidth={aiming ? 3 : 2} strokeDasharray={aiming ? "10 6" : "3 8"} />
      ) : null}
      {!battle.preview && selected?.move && <Route from={selected} to={selected.move} tint="#a9d5f9" />}
      {!battle.preview && battle.boss.move && <Route from={battle.boss} to={battle.boss.move} tint="#ffa2bd" />}
      {(battle.preview || battle.sparring) && units.map((unit) => {
        const destination = unit.force?.end ?? unit.move
        const tint = battle.sparring ? sideTints[sideOf(battle, unit.id)] : isFighter(unit) ? "#a9d5f9" : "#ffa2bd"
        return destination && <Route key={unit.id} from={unit.force?.start ?? unit} to={destination} tint={tint} />
      })}
      {telegraph && <ChargeWarning from={telegraph.from} to={telegraph.to} fill={elapsed} canvas={canvas} />}
      {units.map((unit) => unit.hp && unit.telegraph && <ChargeWarning key={unit.id}
        from={unit.telegraph.from} to={unit.telegraph.to}
        fill={Math.max(0, 1 - (unit.telegraph.until - battle.time) / CHARGE.windup)} canvas={canvas + "-charge-" + unit.id} />)}
      {units.sort((a, b) => a.y - b.y).map((unit) => (
        <Token key={unit.id} unit={unit} selected={unit === selected} battle={battle} canvas={canvas} />
      ))}
      {selected && <AimPreview battle={battle} actor={selected} pointer={pointer} aiming={aiming} />}
      <EdgeSkillEffects battle={battle} />
      <EdgeBulwarkReadiness battle={battle} />
      <EdgeBulwarkEffects battle={battle} layer="front" />
      <EdgeBulwarkTraits battle={battle} />
      <EdgeWardenReadiness battle={battle} />
      <EdgeWardenEffects battle={battle} layer="front" />
      <EdgeWardenTraits battle={battle} layer="front" />
      <EdgeBerserkerEffects battle={battle} layer="front" />
      <EdgeBerserkerTraits battle={battle} layer="front" />
      <EdgePaladinEffects battle={battle} layer="front" />
      <EdgePaladinTraits battle={battle} layer="front" />
      <EdgeSpellbreakerTraits battle={battle} layer="front" />
      <EdgeSpellbreakerEffects battle={battle} layer="front" />
      <EdgeAssassinEffects battle={battle} layer="front" />
      <EdgeWarlockEffects battle={battle} layer="front" />
      <EdgeLifebringerEffects battle={battle} layer="front" />
      <EdgeBinderEffects battle={battle} layer="front" />
      <EdgeDancerEffects battle={battle} layer="front" />
      <EdgeDancerTraits battle={battle} layer="front" />
      <EdgeHealerEffects battle={battle} layer="front" />
      <EdgeHealerTraits battle={battle} layer="front" />
      <EdgeBardEffects battle={battle} layer="front" />
      <EdgeBardTraits battle={battle} layer="front" />
      <EdgeBinderTraits battle={battle} layer="front" />
      <EdgeLifebringerTraits battle={battle} layer="front" />
      <EdgeWarlockTraits battle={battle} layer="front" />
      <EdgeAssassinTraits battle={battle} layer="front" />
      <EdgeRangerEffects battle={battle} layer="front" />
      <RangerWatchMarks battle={battle} />
      <RangerGoldBuffs battle={battle} />
      <EdgeRangerPassives battle={battle} />
      <EdgeSummons battle={battle} />
      <EdgeSummonEffects battle={battle} layer="front" />
      <EdgeSummonTraits battle={battle} />
      <EdgeEffects battle={battle} viewBox={viewBox} occluders={occluders} />
    </svg>
  )
}

function SparringRoster({ battle, side, team }: { battle: EdgeBattle; side: EdgeSide; team: EdgeFighter[] }) {
  return (
    <section className="edge-sparring__roster client-panel" data-side={side} aria-label={sideNames[side]}>
      <h2>{sideNames[side]}</h2>
      {team.map((fighter) => {
        const sharedAt = side === "enemy" ? battle.sparring!.sharedAt : battle.sharedAt
        const proc = battle.runtime.notices.findLast(({ owner }) => owner === fighter.id)
        const status = !fighter.hp ? "下场" : isOutside(fighter) ? "出界" : cooldown(Math.max(sharedAt, fighter.actionAt), battle.time)
        return <div className="edge-sparring__fighter" key={fighter.id} data-down={!fighter.hp}>
          <div><b>{fighter.card.name}</b><span>{status}</span></div>
          <Meter unit={fighter} label={sideNames[side] + fighter.card.name + "生命"} />
          <small title={fighter.actives.map((skill) => skill.description).join("\n")}>{fighter.actives.map((skill) => skill.name).join(" · ")}</small>
          {proc && <small className="edge-proc" data-gold={proc.gold}>{proc.gold && "✦ "}{proc.name}</small>}
        </div>
      })}
    </section>
  )
}

function SparringArena({ battle, speed, setSpeed, onBack, togglePause, restart }: {
  battle: EdgeBattle; speed: number; setSpeed: (speed: number) => void; onBack: () => void; togglePause: () => void; restart: () => void
}) {
  const { time, phase, finishedAt } = battle
  const { rivals, actions } = battle.sparring!
  const finished = finishedAt !== null
  const showResult = finished && time - finishedAt >= .56
  const healingPercent = Math.round(sparringHealingMultiplier(finishedAt ?? time) * 100)
  return (
    <div className="battle-page edge-page edge-page--sparring" data-phase={phase}>
      <header className="client-header battle-top">
        <button type="button" className="battle-back" onClick={onBack}><RiArrowLeftLine size={19} aria-hidden />配装</button>
        <b>斗蛐蛐</b>
        <div className="edge-top-actions">
          <span aria-label="战斗时间">{Math.floor(finishedAt ?? time)}s</span>
          <select className="client-select" aria-label="战斗速度" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            {[1, 2, 4].map((rate) => <option value={rate} key={rate}>{rate}×</option>)}
          </select>
          <button type="button" className="client-key" disabled={phase === "ready" || finished} onClick={togglePause}>{phase === "paused" ? "继续" : "暂停"}</button>
          <button type="button" className="client-key" onClick={restart}>重赛</button>
        </div>
      </header>
      <main className="edge-sparring">
        <SparringRoster battle={battle} side="enemy" team={rivals} />
        <div className="edge-stage">
          <EdgeBoard battle={battle} />
          {healingPercent < 100 && (
            <span className="edge-sparring__healing"
              title={`第 ${SPARRING_HEALING.start} 秒起逐步降低双方治疗量，第 ${SPARRING_HEALING.fullDecay} 秒降至 ${Math.round(SPARRING_HEALING.minimum * 100)}%。`}>
              治疗 {healingPercent}%
            </span>
          )}
          {phase === "paused" && <span className="edge-paused">已暂停</span>}
          {(phase === "ready" || showResult) && <div className="edge-cover">
            {showResult && <strong role="status">{phase === "draw" ? "平局" : sideNames[phase === "won" ? "ally" : "enemy"] + "胜利"}</strong>}
            <button className="client-key client-key--primary" type="button" onClick={finished ? restart : togglePause}>{finished ? "再来一局" : "开战"}</button>
          </div>}
        </div>
        <SparringRoster battle={battle} side="ally" team={battle.team} />
        {actions.length > 0 && <section className="edge-sparring__record client-panel" aria-label="行动记录">
          <h2>行动记录</h2>
          <ol>
            {actions.slice(-8).reverse().map(({ time, side, actorId, actor, name }) =>
              <li key={time + ":" + actorId + ":" + name} data-side={side}>
                <time>{time.toFixed(1)}s</time><span title={sideNames[side]}>{actor}</span><b>{name}</b>
              </li>)}
          </ol>
        </section>}
      </main>
    </div>
  )
}

export function EdgeArena({ lineup: initialLineup, rivals, onBack }: { lineup: EdgeInputCard[]; rivals?: EdgeInputCard[]; onBack: () => void }) {
  const [lineup, setLineup] = useState(initialLineup)
  const live = useRef<EdgeBattle | null>(null)
  const speedRef = useRef(1)
  const [speed, setSpeed] = useState(1)
  const [battle, setBattle] = useState(() => createEdgeBattle(lineup, rivals))
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [aiming, setAiming] = useState<SkillOrder | null>(null)
  const [pointer, setPointer] = useState<EdgePoint | null>(null)
  const selected = fighterFor(battle, selectedId)
  const [settlement, setSettlement] = useState("")
  const [settlementRetry, setSettlementRetry] = useState(0)
  const [settlementFailed, setSettlementFailed] = useState(false)
  const [settlementSaving, setSettlementSaving] = useState(false)
  const [rematchPending, setRematchPending] = useState(false)
  const settled = useRef<string | null>(null)

  useEffect(() => {
    const run = lineup[0]?.cultivationRun
    if (!run || rivals || !["won", "lost"].includes(battle.phase) || settled.current === run.id) return
    settled.current = run.id
    setSettlementFailed(false)
    setSettlementSaving(true)
    setSettlement("正在验证战斗并保存培养奖励…")
    settleCultivation(run.userId, run.id, battle.commands ?? []).then(result => {
      setSettlementSaving(false)
      setSettlement(result.duplicate ? "本场奖励已保存；返回战备开始新的培养战斗。" : result.won
        ? `培养奖励：+${result.training} 训练点 · 每张卡 +${result.exp} EXP · 出战职业各 +${result.mastery} 熟练度`
        : "战斗已记录。胜利可以获得培养奖励。")
    }).catch(error => { settled.current = null; setSettlementSaving(false); setSettlementFailed(true); setSettlement(error instanceof Error ? error.message : "奖励保存失败，可重试") })
  }, [battle.phase, battle.commands, lineup, rivals, settlementRetry])

  useEffect(() => {
    live.current = createEdgeBattle(lineup, rivals)
    let frame = 0
    let last = performance.now()
    let queuedTime = 0
    const loop = (now: number) => {
      const active = live.current
      const elapsed = Math.max(0, Math.min(0.05, (now - last) / 1000))
      if (active) {
        let changed = false
        if (active.sparring || active.commands) {
          queuedTime += elapsed * speedRef.current
          while (queuedTime >= SPARRING_STEP) {
            if (!stepEdgeBattle(active, SPARRING_STEP)) {
              queuedTime = 0
              break
            }
            queuedTime -= SPARRING_STEP
            changed = true
          }
        } else changed = stepEdgeBattle(active, elapsed)
        if (changed) setBattle(snapshotEdgeBattle(active))
      }
      last = now
      frame = requestAnimationFrame(loop)
    }
    const pauseHidden = () => {
      const active = live.current
      if (document.hidden && active?.phase === "running") {
        active.phase = "paused"
        setBattle(snapshotEdgeBattle(active))
      }
    }
    frame = requestAnimationFrame(loop)
    document.addEventListener("visibilitychange", pauseHidden)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("visibilitychange", pauseHidden)
      live.current = null
    }
  }, [lineup, rivals])

  const choose = useCallback((uid: number) => {
    setSelectedId(uid)
    setAiming(null)
  }, [])

  const togglePause = useCallback(() => {
    const active = live.current
    if (!active || active.finishedAt !== null) return
    active.phase = active.phase === "running" ? "paused" : "running"
    setBattle(snapshotEdgeBattle(active))
  }, [])

  const fire = useCallback((order: EdgeOrder, targetUid?: EdgeUnitId, at?: EdgePoint) => {
    const active = live.current
    if (!active) return
    const actor = fighterFor(active, selectedId)
    const target = targetUid === "boss" || targetUid === undefined && order === "basic" ? active.boss
      : active.team.find((member) => member.card.uid === targetUid) ?? null
    if (!actor) return
    const location = order !== "basic" && aimSide(actor, order) && target ? target : at
    const error = issueEdgeOrder(active, actor, order, target, location)
    if (error) active.notice = { text: error, until: active.time + 1.2 }
    else setAiming(null)
    setBattle(snapshotEdgeBattle(active))
  }, [selectedId])

  const aim = useCallback((order: SkillOrder) => {
    const active = live.current
    if (!active || (active.phase !== "running" && active.phase !== "paused")) return
    const actor = fighterFor(active, selectedId)
    if (!actor || actionProblem(active, actor)) return
    if (activeFor(actor, order).aim.mode === "self") fire(order, actor.id, actor)
    else setAiming((value) => value === order ? null : order)
  }, [fire, selectedId])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.code === "Space" && !(event.target instanceof HTMLSelectElement)) {
        event.preventDefault()
        togglePause()
      } else if (rivals) return
      else if (event.code === "KeyQ") fire("basic")
      else if (event.code === "KeyE") aim("skill")
      else if (event.code === "KeyR") aim("skill2")
      else if (/^Digit[1-3]$/.test(event.code)) {
        const card = live.current?.team[Number(event.code.slice(-1)) - 1]
        if (card?.hp) choose(card.card.uid)
      } else if (event.code === "Escape" && aiming) {
        event.preventDefault()
        setAiming(null)
      }
    }
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  }, [aim, aiming, choose, fire, rivals, togglePause])

  function clickBoard(event: PointerEvent<SVGSVGElement>) {
    const active = live.current
    if (event.button !== 0 || !active || (active.phase !== "running" && active.phase !== "paused")) return
    const position = boardPoint(event)
    if (!position) return
    const actor = fighterFor(active, selectedId)
    const target = unitAt(active, position, aiming && actor ? aimSide(actor, aiming) : undefined)
    if (aiming && actor && !actionProblem(active, actor)) {
      fire(aiming, target?.id, position)
      return
    }
    const portal = !aiming && portalRoute(active, position, actor?.id)
    if (!portal && target && "card" in target) {
      choose(target.card.uid)
    } else if (!portal && target === active.boss) {
      fire("basic")
    } else if (actor) {
      setAiming(null)
      const error = moveEdgeFighter(active, actor, position)
      if (error) active.notice = { text: error, until: active.time + 1.2 }
      setBattle(snapshotEdgeBattle(active))
    }
  }

  async function restart() {
    if (rematchPending || settlementSaving) return
    let cards = lineup
    const run = lineup[0]?.cultivationRun
    if (run && !rivals) {
      setRematchPending(true)
      try {
        const result = await startCultivation(run.userId, lineup)
        cards = result.lineup
        setLineup(cards)
      } catch (error) {
        setSettlement(error instanceof Error ? error.message : "下一场准备失败，请重试")
        return
      } finally { setRematchPending(false) }
    }
    live.current = createEdgeBattle(cards, rivals)
    if (rivals) live.current.phase = "running"
    setBattle(snapshotEdgeBattle(live.current))
    setSelectedId(null)
    setPointer(null)
    setAiming(null)
    setSettlement("")
    setSettlementFailed(false)
    settled.current = null
  }

  if (battle.sparring) return <SparringArena battle={battle} speed={speed} setSpeed={(rate) => {
    speedRef.current = rate
    setSpeed(rate)
  }} onBack={onBack} restart={restart} togglePause={togglePause} />

  const { boss, time, phase, finishedAt } = battle
  const active = phase === "running" || phase === "paused"
  const skillReady = !!selected && active && !actionProblem(battle, selected)
  const returning = !!selected && isOutside(selected)
  const moveReady = !!selected && active && !moveProblem(battle, selected)
  const finished = finishedAt !== null
  const showResult = finished && time - finishedAt >= 0.56
  const sharedFill = recastFill(battle.sharedAt, time, COOLDOWN.shared)
  const orderFill = selected ? Math.min(sharedFill, recastFill(selected.actionAt, time, selected.actionCooldown)) : 0
  const orderPulse = skillReady && readyLight(Math.max(selected.actionAt, battle.sharedAt), time) > 0
  const movePulse = moveReady && !returning && readyLight(Math.max(battle.moveAt, battle.sharedAt), time) > 0
  const bossMoveAt = Math.max(boss.moveAt, boss.sharedAt)
  const bossAttackAt = Math.max(boss.actionAt, boss.sharedAt)
  const moveClock = selected?.force ? "位移中" : returning ? (selected?.move ? "回场中" : "就绪")
    : battle.moveAt <= time && battle.sharedAt > time ? "等共享" : cooldown(battle.moveAt, time)
  const selectedSide = selected && aiming ? aimSide(selected, aiming) : undefined
  const skillHint = !selected ? "" : returning && !aiming ? "点场内空地回场"
    : aiming ? selectedSide === "ally" ? "选择队友" : selectedSide === "enemy" ? "选择敌人" : "选择落点" : ""

  return (
    <div className="battle-page edge-page" data-phase={phase}>
      <header className="client-header battle-top">
        <button type="button" className="battle-back" onClick={onBack}><RiArrowLeftLine size={19} aria-hidden />战斗配装</button>
        <b>边线试战 · {lineup[0]?.combatVersion === "four-v2" ? "四职业 V2" : "旧规则 V1"}</b>
        <div className="edge-top-actions">
          <span>{Math.floor(finishedAt ?? time)}s</span>
          <button type="button" className="client-key" disabled={phase === "ready" || finished} onClick={togglePause}>{phase === "paused" ? "继续" : "暂停"}</button>
          <button type="button" className="client-key" disabled={rematchPending || settlementSaving} onClick={() => void restart()}>重开</button>
        </div>
      </header>
      <main className="edge-shell">
        <section className="edge-boss client-panel" aria-label="敌方">
          <div className="edge-boss__heading">
            <b>谱面幽灵</b><span>{number.format(boss.hp)} / {number.format(boss.maxHp)}</span>
          </div>
          <Meter unit={boss} label="谱面幽灵生命" />
          <div className="edge-boss__timers">
            <Recast label="移动" value={boss.force ? "位移中" : boss.move ? "移动中" : cooldown(bossMoveAt, time)}
              fill={recastFill(bossMoveAt, time, COOLDOWN.move)} ready={active && !boss.force && !boss.move && bossMoveAt <= time} />
            <Recast label={battle.telegraph ? "冲撞" : "出手"} value={battle.telegraph ? "蓄力" : cooldown(bossAttackAt, time)}
              fill={battle.telegraph ? recastFill(battle.telegraph.until, time, CHARGE.windup) : recastFill(bossAttackAt, time, boss.actionCooldown)}
              ready={active && !battle.telegraph && bossAttackAt <= time} />
            <Recast label="共享" value={cooldown(boss.sharedAt, time)}
              fill={recastFill(boss.sharedAt, time, COOLDOWN.shared)} ready={active && boss.sharedAt <= time} />
          </div>
        </section>
        <div className="edge-stage" onPointerLeave={() => setPointer(null)}>
          <EdgeBoard battle={battle} selected={selected} aiming={skillReady ? aiming : null} pointer={pointer}
            onPointer={(event) => setPointer(boardPoint(event))} onClick={clickBoard} />
          {battle.notice && <div className="edge-notice" role="status">{battle.notice.text}</div>}
          {phase === "paused" && <span className="edge-paused">已暂停</span>}
          {(phase === "ready" || showResult) && (
            <div className="edge-cover">
              {finished && <strong>{phase === "won" ? "战斗胜利" : "队伍下场"}</strong>}
              <button className="client-key client-key--primary" type="button" disabled={rematchPending || settlementSaving} onClick={finished ? () => void restart() : togglePause}>{finished ? "再来一局" : "开战"}</button>
              {settlement && <p className="cultivation-status" role="status">{settlement}</p>}
              {finished && lineup[0]?.cultivationRun && settlementFailed && <button type="button" className="client-key" onClick={() => setSettlementRetry(value => value + 1)}>重试保存培养奖励</button>}
              {phase === "ready" && <small>点卡选人 · 点地移动 · Q 普攻 · E / R 战技 · 空格暂停</small>}
            </div>
          )}
        </div>
        <div className="edge-roster" role="group" aria-label="出战卡牌">
          {battle.team.map((fighter, index) => (
            <button type="button" key={fighter.card.uid} className="edge-card" disabled={!fighter.hp}
              aria-pressed={fighter === selected} onClick={() => choose(fighter.card.uid)}
              data-pulse={active && fighter.hp > 0 && readyLight(fighter.actionAt, time) > 0}
              style={{ "--edge-tint": colors[fighter.card.job] } as CSSProperties}>
              <span className="edge-card__art">{fighter.card.art ? <img src={fighter.card.art} alt="" draggable={false} /> : Array.from(fighter.card.name)[0]}</span>
              <span className="edge-card__body" title={fighter.combatVersion === "four-v2" ? equippedCombatRoles(fighter).map(role => EDGE_ROLE_DETAILS[role]).filter(Boolean).join(" · ") : EDGE_ROLE_DETAILS[fighter.card.subjob.id]}><b>{fighter.card.name}</b>
                <small>{[JOB_LABEL[fighter.card.job] === fighter.card.name ? "" : JOB_LABEL[fighter.card.job], isOutside(fighter) ? "出界" : ""].filter(Boolean).join(" · ")}</small>
              </span>
              <kbd>{index + 1}</kbd>
              <Meter unit={fighter} label={fighter.card.name + "生命"} />
              <span className="edge-card__recast">
                <span data-ready={active && !actionProblem(battle, fighter)}>
                  {!fighter.hp ? "下场" : fighter.force ? "位移中" : fighter.actionAt > time ? cooldown(fighter.actionAt, time) : battle.sharedAt > time ? "等共享" : "可出手"}
                </span>
                <Fill value={recastFill(fighter.actionAt, time, fighter.actionCooldown)} />
              </span>
            </button>
          ))}
        </div>
        <footer className="edge-commands client-panel" style={{ "--edge-tint": selected ? colors[selected.card.job] : undefined } as CSSProperties}>
          <div className="edge-commands__timers">
            <Recast label={returning ? "回场" : "移动"} value={moveClock} ready={moveReady} pulse={movePulse}
              fill={returning ? Number(!selected?.force) : Math.min(sharedFill, recastFill(battle.moveAt, time, COOLDOWN.move))} />
            <Recast label="共享" value={cooldown(battle.sharedAt, time)} fill={sharedFill}
              ready={active && sharedFill === 1} pulse={active && readyLight(battle.sharedAt, time) > 0} />
          </div>
          <div className="edge-commands__buttons" style={{ "--edge-order-fill": orderFill } as CSSProperties}>
            <button type="button" className="client-key edge-order" disabled={!skillReady || phase !== "running"} data-pulse={orderPulse} onClick={() => fire("basic")}><kbd>Q</kbd> 普攻</button>
            {(["skill", "skill2"] as const).map((order, index) => {
              const skill = selected && activeFor(selected, order)
              const isGold = selected?.gold && skill?.id === selected.pool.active[selected.gold.active].id
              return <button key={order} type="button" className="client-key edge-order" disabled={!skillReady || phase !== "running"}
                data-pulse={orderPulse} data-gold={!!isGold} aria-pressed={aiming === order && skillReady}
                title={skill?.description} onClick={() => aim(order)}><kbd>{index ? "R" : "E"}</kbd> {skill?.name ?? "战技"}</button>
            })}
          </div>
          {selected && <div className="edge-passives" aria-label="被动技能">
            {combatHasRole(selected, "bulwark") && (
              <span className="edge-passive" data-cooling={(selected.passiveAt[BULWARK_COVER.id] ?? 0) > time} title={EDGE_ROLE_DETAILS.bulwark}>
                {BULWARK_COVER.name}<Fill value={recastFill(selected.passiveAt[BULWARK_COVER.id] ?? 0, time, BULWARK_COVER.cooldown)} />
              </span>
            )}
            {selected.passives.map((passive) => {
              const readyAt = selected.passiveAt[passive.id] ?? 0
              const remaining = readyAt > time ? cooldown(readyAt, time) : ""
              return <span key={passive.id} className="edge-passive" data-cooling={!!remaining} title={passive.description + (remaining ? " · " + remaining : "")}>
                {passive.name}<Fill value={recastFill(readyAt, time, passiveCooldown(passive.id))} />
              </span>
            })}
          </div>}
          {selected && statusNames(battle, selected).length > 0 && <div className="edge-status">{statusNames(battle, selected).join(" · ")}</div>}
          {selected && battle.runtime.notices.filter((item) => item.owner === selected.id).slice(-1).map((item) => (
            <div className="edge-proc" data-gold={item.gold} key={item.id}>{item.gold ? "✦ " : ""}{item.name}</div>
          ))}
          <small title={returning ? "界外移速 −" + (1 - EXILE.speed) * 100 + "% · 伤害 −75% · 承伤 +35%" : undefined}>{skillHint}</small>
        </footer>
      </main>
    </div>
  )
}
