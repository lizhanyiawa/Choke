import { RARITY_COLOR } from "@/desk/rarity"

import type { EdgeBattle } from "./edgeBattle"
import { along, areaPath, clamp, direction, edgeDistance, inside, type EdgePoint } from "./edgeSkills/geometry"
import { unitOf } from "./edgeSkills/state"
import { SUMMON_PLANS, type SummonForm } from "./edgeSkills/summonPlans"
import { SUMMON_CHOREOGRAPHY } from "./edgeSkills/summonChoreo"
import { SUMMON_DISMISS_TIME, summonActionArea, summonLink, type SummonBody, type SummonGroup } from "./edgeSkills/summons"

const prism = ["#f5cbff", "#a4ddff", "#ffc4e4"]
const shell = "#281c38"
const shade = "#594267"
const glint = "#fff6ff"
const translate = ({ x, y }: EdgePoint) => `translate(${x} ${y})`
const angle = ({ x, y }: EdgePoint) => Math.atan2(y, x) * 180 / Math.PI

function Silhouette({ form, tint, time }: { form: SummonForm; tint: string; time: number }) {
  switch (form) {
    case "sentry":
      return <>
        <path d="M-28 14-37 24-17 23-12 16M13 16 18 23 38 24 28 14M-27-9-21-24 17-26 29-9 24 15 0 22-24 15Z" fill={shell} />
        <path d="M-21-24 4-16 17-26 29-9 4-1-27-9Z" fill={tint} fillOpacity=".72" />
        <path d="M-18 2-4 5-9 11ZM18 2 4 5 9 11Z" fill={glint} stroke="none" />
        <path d="M-7-27-5-37 3-40 6-27Z" fill={shade} />
      </>
    case "beast":
      return <>
        <path d="M-31-5-50-21-44 1-32 9-28 24-16 23-12 10 7 13 12 25 28 25 24 8 40 0 33-12 23-13 16-30 9-17-10-16-23-23Z" fill={shell} />
        <path d="M-40-9-23-12-16-20 1-11 16-23 24-11 33-10 39 0 16 8-3 4-19 9-31 3Z" fill={tint} fillOpacity=".73" />
        <path d="M26-7 34-4 25-1Z" fill={glint} stroke="none" />
        <path d="M-16 12-17 21M17 15 20 22" stroke={glint} strokeWidth="2" />
      </>
    case "ram":
      return <>
        <path d="M-46-16-30-27-11-19 0-23 14-13 19-25 42-36 37-20 25-9 44-3 33 11 24 13 21 25 7 27 3 15-16 13-18 24-32 25-31 9-43 2Z" fill={shell} />
        <path d="M-46-16-30-27-11-19-5-9-23-2-34 10-43 2Z M14-13 19-25 42-36 37-20 25-9 44-3 33 11 21 9Z" fill={tint} />
        <path d="M-5-9 14-13 21 9 3 15-16 13-23-2Z" fill={shade} />
        <path d="M31-3 39-2 30 3Z" fill={glint} stroke="none" />
        <path d="M-29-20-18-16M-4-4 5 4 12-4M20-20 34-28" stroke={glint} strokeWidth="2.2" />
      </>
    case "ward":
      return <>
        <path d="M-17-13-29-21-27 9-11 27 0 36 11 27 27 9 29-21 17-13 0-28Z" fill={shell} />
        <path d="M0-28 19-13 17 12 0 28-17 12-19-13Z" fill={shade} />
        <path d="M0-28 17-14 0-7-17-14Z M-25-14-21 9-11 20-16 0Z M25-14 21 9 11 20 16 0Z" fill={tint} fillOpacity=".62" />
        <path d="M0-5 7 5 0 16-7 5Z" fill={glint} />
      </>
    case "stake":
      return <>
        <path d="M-25 22-18 13-11 11-12-15 0-37 12-15 11 11 18 13 25 22 17 29H-17Z" fill={shell} />
        <path d="M0-37 12-15 11 11 0 20-11 11-12-15Z" fill={tint} fillOpacity=".55" />
        <path d="M0-30V16M-15 21H15" stroke={glint} strokeWidth="2" />
        <path d="M0-11 5-3 0 5-5-3Z" fill={glint} />
      </>
    case "wall":
      return <>
        <path d="M-46 14-44-12-27-22-18-12-10-31 0-38 10-31 18-12 27-22 44-12 46 14 33 24H-33Z" fill={shell} />
        <path d="M-45-9-27-22-18-12-16 14-33 21-43 14Z M45-9 27-22 18-12 16 14 33 21 43 14Z" fill={shade} />
        <path d="M-16 14-13-19 0-34 13-19 16 14 0 24Z" fill={tint} fillOpacity=".78" />
        <path d="M-36-8-25-12-26 12M36-8 25-12 26 12M0-26V12" fill="none" stroke={glint} strokeWidth="2.7" />
      </>
    case "bird": {
      const flap = 5 + Math.sin(time * 34) * 8
      return <>
        <path d={`M-13-4-29 ${-24 - flap} 8 ${-16 - flap / 2} 20-8 36 0 20 8 8 ${16 + flap / 2} -29 ${24 + flap} -13 4-35 12-24 0-35-12Z`} fill={tint} />
        <path d="M-27 0-6-5 19-7 36 0 19 7-6 5Z" fill={shell} />
        <path d="M-7 0H27" stroke={glint} strokeWidth="2.4" />
      </>
    }
    case "decoy":
      return <>
        <path d="M-8-18-18-32 0-40 18-32 8-18 21-11 33 2 21 8 10 0 16 25 3 28 0 12-3 28-16 25-10 0-21 8-33 2-21-11Z" fill={shade} />
        <path d="M-18-32 0-26 18-32 0-40Z M-21-11 0-4 21-11 8-18H-8Z M-16 25 0 11 16 25 2 31H-2Z" fill={tint} fillOpacity=".76" />
        <path d="M-6-30-1-28M6-30 1-28" stroke={glint} />
      </>
    case "lantern":
      return <>
        <path d="M0-36 15-26 12-20 23-10 20 9 9 18 5 18 8 30 0 36-8 30-5 18-9 18-20 9-23-10-12-20-15-26Z" fill={shell} />
        <path d="M-12-20H12L23-10 20 9 9 18H-9L-20 9-23-10Z" fill={tint} fillOpacity=".69" />
        <path d="M0-16 9-3 0 13-9-3Z" fill={glint} stroke="none" />
        <path d="M-12-13-10 10M12-13 10 10" stroke={shade} />
      </>
    case "medic":
      return <>
        <path d="M-21-13-27-35-10-25 0-28 10-25 27-35 21-13 30 6 17 21 0 27-17 21-30 6Z" fill={shell} />
        <path d="M-24-27-12-20-20-12ZM24-27 12-20 20-12ZM-28 7-10 1 0 11 10 1 28 7 16 21 0 27-16 21Z" fill={tint} fillOpacity=".7" />
        <path d="M0-20V-8M-6-14H6M-19-4-12-2M19-4 12-2" stroke={glint} strokeWidth="3.1" />
      </>
    case "mist":
      return <>
        <path d="M-17 25-31 21-25 8-28-9-17-27 0-35 17-27 28-9 25 8 31 21 17 25 9 19 0 31-9 19Z" fill={shell} />
        <path d="M-28-9-17-27 0-35 17-27 28-9 17-14 8-9 0-19-8-9-17-14Z" fill={tint} fillOpacity=".55" />
        <path d="M-16-5-8-1-12 4ZM16-5 8-1 12 4Z" fill={glint} stroke="none" />
        <path d="M-36 19Q-28 6-38-5M36 19Q28 6 38-5" fill="none" strokeOpacity=".63" />
      </>
    case "doll":
      return <>
        <path d="M-20-16-24-35-13-34-6-22 6-22 13-34 24-35 20-16 22-5 16 8 23 16 14 27 5 24 0 13-5 24-14 27-23 16-16 8-22-5Z" fill={shell} />
        <path d="M-22-5-13-15H13L22-5 12 7 0 11-12 7Z" fill={tint} fillOpacity=".75" />
        <path d="M-12-6-6-4M12-6 6-4" stroke={glint} strokeWidth="3.2" />
        <path d="M-18 17-12 21M18 17 12 21" stroke={glint} strokeWidth="2" />
      </>
    case "spool":
      return <>
        <path d="M-25 23-17 10-26 1-23-19-10-28H10L23-19 26 1 17 10 25 23 0 29Z" fill={shell} />
        <path d="M-26 1-23-19-10-28H10L23-19 26 1 14 12H-14Z" fill={shade} />
        <path d="M-17-14 17-19M-18-6 18-11M-18 2 18-3M-10 9 11 6" strokeWidth="3.4" />
        <path d="M11-16Q38-19 37 1T21 18" fill="none" stroke={glint} strokeWidth="2.5" />
      </>
    case "bow":
      return <>
        <path d="M-29 18-16 9-7 9-7-9-16-11-27-26-36-23-31-4-16 10-10 22 0 27 10 22 16 10 31-4 36-23 27-26 16-11 7-9 7 9 16 9 29 18 18 25H-18Z" fill={shell} />
        <path d="M-32-22-18-6-6-3 0 9 6-3 18-6 32-22 20-11 0-19-20-11Z" fill={tint} fillOpacity=".55" />
        <path d="M-32-22 0-30 32-22M0-24V14" fill="none" stroke={glint} strokeWidth="2" />
      </>
    case "bell":
      return <>
        <path d="M-25-32H25L30-23H20L21 4 30 13 24 18H-24L-30 13-21 4-20-23H-30Z" fill={shell} />
        <path d="M-19-22-8-17H8L19-22 20 5 27 13H-27L-20 5Z" fill={tint} fillOpacity=".55" />
        <path d="M-10 18Q-10 33 0 34 10 33 10 18Z" fill={shade} />
        <path d="M-15 5H15M-5-13 0-8 5-13" fill="none" stroke={glint} strokeWidth="2.5" />
      </>
    case "mirror":
      return <>
        <path d="M0-37 24-16 19 13 0 30-19 13-24-16Z" fill={shell} />
        <path d="M0-28 17-14 12 10 0 21-12 10-17-14Z" fill={tint} fillOpacity=".7" />
        <path d="M-14-13 9-19 13-16-16-2ZM-12 8 14-4 11 10 0 21Z" fill={glint} fillOpacity=".82" stroke="none" />
        <path d="M-25 3-32 13-26 24M25 3 32 13 26 24" fill="none" />
      </>
    case "bridge":
      return <>
        <path d="M-34 19-36 0-27-19-15-22-7-15 0-18 7-15 15-22 27-19 36 0 34 19 21 22 21 4 12-4 0 4-12-4-21 4-21 22Z" fill={shell} />
        <path d="M-35 1-23-12-11-14 0-7 11-14 23-12 35 1 29 5 20-3 11-5 0 3-11-5-20-3-29 5Z" fill={tint} fillOpacity=".8" />
        <path d="M-29 10-26 16M29 10 26 16M-4-14H4" stroke={glint} strokeWidth="3" />
      </>
    case "gate":
      return <>
        <path d="M-32 25-33-10-22-32 0-43 22-32 33-10 32 25 17 31 17-8 0-24-17-8-17 31Z" fill={shell} />
        <path d="M-31-10-20-30 0-39 20-30 31-10 24-3 19-19 0-29-19-19-24-3Z" fill={tint} fillOpacity=".82" />
        <path d="M-25 12V24M25 12V24M0-34V-25" stroke={glint} strokeWidth="3" />
        <path d="M0-16 7 0 0 18-7 0Z" fill={glint} fillOpacity={.47 + Math.sin(time * 8) * .18} stroke="none" />
      </>
  }
}

function SummonToken({ body, tint, age, flash, fade, height }: {
  body: SummonBody; tint: string; age: number; flash: number; fade: number; height: number
}) {
  const rotates = ["bird", "beast", "ram"].includes(body.form)
  const hovering = body.form === "bird" || body.form === "lantern"
  const lift = height + (hovering ? 11 : 0) + Math.sin(age * 7 + body.x * .01) * (hovering ? 3.2 : 1.4) + flash * 6
  const squash = 1 + flash * .13
  const size = (body.form === "wall" ? 1.17 : body.form === "ram" ? 1.12 : 1) * (.76 + .24 * fade)
  return <g data-summon-form={body.form} data-summon-unit={body.id} data-summon-hp={body.hp} opacity={fade}
    transform={`${translate(body)} scale(${size})`}>
    <ellipse cy="16" rx="37" ry="17" fill="#15101d" opacity=".74" />
    <ellipse cy="15" rx="32" ry="13" fill={tint} fillOpacity={.10 + flash * .22} stroke={tint} strokeWidth="1.8" strokeOpacity=".69" />
    <g transform={`translate(0 ${-lift / size}) rotate(${rotates ? angle(body.facing) : 0}) scale(${squash} ${1 / squash})`}
      stroke={tint} strokeWidth={2.7 + flash} strokeLinecap="round" strokeLinejoin="round">
      <Silhouette form={body.form} tint={tint} time={age} />
    </g>
    {flash > 0 && <ellipse cy="15" rx={34 + (1 - flash) * 36} ry={13 + (1 - flash) * 14}
      fill="none" stroke={glint} strokeWidth="2.3" opacity={flash * .85} />}
    <rect x="-31" y="35" width="62" height="8" rx="3" fill="#1a1024" stroke={tint} strokeOpacity=".66" strokeWidth="1.6" />
    <rect x="-30" y="36" width={60 * body.hp / body.maxHp} height="6" rx="2" fill={tint} />
  </g>
}

function Footprints({ body, tint, now, fold, flying }: {
  body: SummonBody; tint: string; now: number; fold: boolean; flying: boolean
}) {
  if (!body.trail || body.movingAt === undefined || now - body.movingAt > .24) return null
  const opacity = 1 - (now - body.movingAt) / .24
  const path = [...body.trail, body]
  if (flying) return <polyline points={path.map(({ x, y }) => x + "," + y).join(" ")}
    fill="none" stroke={tint} strokeWidth="3" strokeDasharray="4 5" opacity={opacity * .58} />
  return <g fill="none" stroke={tint} strokeWidth={fold ? 3.8 : 2.6} opacity={opacity}>
    {body.trail.map((at, i) => <path key={i} transform={`${translate(at)} rotate(${angle(direction(at, path[i + 1]))})`}
      d={fold ? "M-8-18 7-6-6 3-8 18" : "M-5-11h8m-8 22h8"}
      opacity={(i + 1) / path.length * .71} />)}
  </g>
}

function FormationCue({ body, group, time }: { body: SummonBody; group: SummonGroup; time: number }) {
  if (!body.hp || group.dismissedAt !== undefined) return null
  const actions = SUMMON_PLANS[group.deployment.kind].actions ?? []
  const index = actions.findIndex(({ slot }) => slot === body.slot)
  if (index < 0) return null
  if (body.actionsAt[index] >= group.until - SUMMON_DISMISS_TIME) return null
  const remains = body.actionsAt[index] - time
  const lead = group.rarity === "Prismatic" ? .39 : .24
  if (remains <= 0 || remains > lead) return null
  const progress = 1 - remains / lead
  const radius = actions[index].step.selector.size[0]
  const hue = ["#ffadba", "#a6ddff", "#d6b3ff"][body.slot]
  return <g transform={translate(body)} opacity={.26 + .53 * progress} data-summon-ready={body.slot}
    fill="none" stroke={hue} strokeWidth={group.rarity === "Prismatic" ? 3.4 : 2.4}>
    {body.slot === 0 ? <path d={"M0 " + -radius + " " + radius * .82 + " 0 0 " + radius + " " + -radius * .82 + " 0Z"}
      strokeDasharray="10 7" transform={"scale(" + (1.06 - .16 * progress) + ")"} />
      : body.slot === 1 ? <path d="M-108 16Q-73-104-7-37M108 16Q73-104 7-37M-104 28Q-62 71-15 41m119-13Q62 71 15 41"
        strokeDasharray="12 8" transform={"scale(" + (.71 + .29 * progress) + ")"} />
        : <g transform={"rotate(" + angle(body.facing) + ") scale(" + (.77 + .26 * progress) + ")"}>
          <path d="M-34-94 6-94 40-61M-34 94 6 94 40 61M22-88 53-88 83-55m-61 143h31l30-33" strokeDasharray="8 5" />
        </g>}
  </g>
}

function Summon({ battle, group }: { battle: EdgeBattle; group: SummonGroup }) {
  const { kind, bodies } = group.deployment
  const plan = SUMMON_PLANS[kind]
  const scene = SUMMON_CHOREOGRAPHY[kind]
  const { motion } = plan
  const [first, second] = bodies
  const age = battle.time - group.start
  const fade = Math.min(clamp(.42 + age / .16, 0, 1), clamp((group.until - battle.time) / SUMMON_DISMISS_TIME, 0, 1))
  const tint = RARITY_COLOR[group.rarity]
  const linkedAction = plan.actions?.find((action) => action.at === "link" || action.at === "ownerLine")
  const link = linkedAction && first.hp ? summonActionArea(battle, group, first, linkedAction)
    : plan.guard?.type === "line" ? summonLink(bodies, plan.guard.reach * 2) : undefined
  const gate = plan.gate && first.hp && second?.hp
  const gateReady = gate && group.dismissedAt === undefined && first.actionAt <= battle.time
  const linkedTarget = motion?.kind === "follow" ? unitOf(battle, group.target) : undefined
  const orbitCenter = motion?.kind === "orbit" ? inside(group.aim, motion.radius + 14) : undefined
  const routeEnd = motion && "reach" in motion && motion.reach ? inside(along(group.from, group.axis, motion.reach)) : inside(group.aim)
  const route = motion?.kind === "patrol" || motion?.kind === "outBack" || motion?.kind === "leap" && first.phase === "out"
  const trio = kind === "ensemble" || kind === "paperBeat"
  return <g data-summon={group.name} data-deployment={kind} data-summon-state={group.dismissedAt !== undefined ? "leaving" : "active"}>
    <title>{group.name}</title>
    {trio && bodies.every(({ hp }) => hp > 0) && <polygon points={bodies.map(({ x, y }) => x + "," + y).join(" ")}
      fill="none" stroke={tint} strokeWidth="2.5" strokeDasharray="6 9" opacity={fade * .46} />}
    {orbitCenter && motion?.kind === "orbit" && <circle cx={orbitCenter.x} cy={orbitCenter.y} r={motion.radius} fill="none"
      stroke={tint} strokeWidth="2.2" strokeDasharray="6 7" opacity={fade * .57} />}
    {route && <path d={`M${first.origin.x} ${first.origin.y}L${routeEnd.x} ${routeEnd.y}`} fill="none"
      stroke={tint} strokeWidth="2" strokeDasharray="5 8" opacity={fade * .48} />}
    {link && <path d={areaPath(link)} fill={tint} fillOpacity=".08" stroke={tint} strokeWidth="2.4"
      strokeDasharray="10 7" opacity={fade * .6} />}
    {gate && <path d={`M${first.x} ${first.y}L${second.x} ${second.y}`}
      stroke={gateReady ? "#b5dbff" : tint} strokeWidth={gateReady ? 4.8 : 3.2} strokeDasharray="10 7"
      opacity={fade * (gateReady ? .58 + .16 * Math.sin(age * 11) : .23)} />}
    {bodies.map((body) => {
      const deathFade = body.destroyedAt === undefined ? 1 : clamp(1 - (battle.time - body.destroyedAt) / SUMMON_DISMISS_TIME, 0, 1)
      if (deathFade <= 0) return null
      const pulse = body.pulseAt === undefined ? 0 : clamp(1 - (battle.time - body.pulseAt) / .3, 0, 1)
      const hit = battle.impacts.findLast((impact) => impact.target === body.id && impact.kind === "hit")
      const hurt = hit ? clamp(1 - (battle.time - hit.time) / .28, 0, 1) : 0
      const color = hurt > .45 ? "#ffa7c5" : group.rarity === "Prismatic" ? prism[body.slot % prism.length] : tint
      const height = motion?.kind === "leap" && body.phase === "out"
        ? Math.sin(Math.PI * edgeDistance(body.origin, body) / Math.max(1, edgeDistance(body.origin, routeEnd))) * 58 : 0
      const footprint = plan.actions?.find((action) => !action.reaction && !action.at &&
        (action.slot === undefined || action.slot === body.slot) && (!action.phase || action.phase === body.phase))
      const circle = plan.gate?.radius ?? plan.terrain?.radius ?? plan.aura?.radius ??
        (footprint?.step.selector.shape === "C" ? footprint.step.selector.size[0] : undefined)
      const fan = footprint?.step.selector.shape === "F" && summonActionArea(battle, group, body, footprint)
      const leavingAt = body.destroyedAt ?? group.dismissedAt
      const fold = leavingAt === undefined ? 0 : clamp((battle.time - leavingAt) / SUMMON_DISMISS_TIME, 0, 1)
      const glyphScale = leavingAt === undefined ? 1.24 + pulse * .24 : 1.24 * (1 - .79 * fold)
      const open = body.hp > 0 && leavingAt === undefined
      return <g key={body.id}>
        {trio && <FormationCue body={body} group={group} time={battle.time} />}
        {linkedTarget?.hp && body.hp > 0 && <path d={`M${linkedTarget.x} ${linkedTarget.y}L${body.x} ${body.y}`}
          stroke={tint} strokeWidth="2.5" strokeDasharray="3 6" opacity={fade * .44} />}
        {circle && body.hp > 0 && (!plan.aura?.phase || plan.aura.phase === body.phase) && <circle cx={body.x} cy={body.y} r={circle}
          fill={color} fillOpacity={plan.terrain || plan.gate ? .11 : .035} stroke={color} strokeWidth={plan.terrain || plan.gate ? 3 : 1.8}
          strokeDasharray={plan.terrain?.type === "block" ? "13 5" : "6 9"} opacity={fade * (plan.gate && !gateReady ? .28 : .56)} />}
        {fan && body.hp > 0 && <path d={areaPath(fan)} fill={color} fillOpacity={.05 + pulse * .2}
          stroke={color} strokeWidth="2" strokeDasharray="5 8" opacity={fade * (.49 + pulse * .43)} />}
        {open && <Footprints body={body} tint={color} now={battle.time}
          fold={kind === "returnBeast" && body.phase === "back"} flying={body.form === "bird" || motion?.kind === "leap" && body.phase === "out"} />}
        <g transform={`${translate(body)} rotate(${angle(body.facing)}) scale(${glyphScale})`} data-summon-crest={kind}
          data-summon-exit={leavingAt !== undefined ? (body.hp ? "fold" : "break") : undefined}>
          <path d={scene.crest} fill={color} fillOpacity={.12 + pulse * .1} stroke={color} strokeLinejoin="round" strokeLinecap="round"
            strokeWidth={2.7 + pulse * 1.6} opacity={(leavingAt === undefined ? .64 + pulse * .31 : .9 - fold * .69) * deathFade} />
        </g>
        <SummonToken body={body} tint={color} age={age} flash={Math.max(pulse, hurt)} fade={fade * deathFade} height={height} />
      </g>
    })}
  </g>
}

export function EdgeSummons({ battle }: { battle: EdgeBattle }) {
  return <g className="edge-summons" aria-hidden="true" pointerEvents="none">
    {battle.runtime.summons.map((group) => <Summon key={group.id} battle={battle} group={group} />)}
  </g>
}

