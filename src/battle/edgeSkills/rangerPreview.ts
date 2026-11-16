import type { EdgeBattle, EdgeFighter, EdgePoint, EdgeUnit } from "../edgeBattle"
import type { EdgeActive } from "./catalog"
import { FIELD, along, direction, inside, left, mirror, point } from "./geometry"
import { basicAttack, forceTo, previewSkillAreas } from "./runtime"

export function arrangeRangerGold(battle: EdgeBattle, actor: EdgeFighter, active: EdgeActive, aim: EdgePoint, id: string) {
  const boss = battle.boss
  const ally = battle.team[1]
  const axis = direction(actor, aim)
  const side = left(axis)
  const stage = (at: EdgePoint, ...extras: EdgePoint[]) => {
    Object.assign(boss, at)
    battle.preview!.targets = extras.map((place, i): EdgeUnit => ({
      ...boss, ...place, id: `dummy-${i + 1}`, once: new Set(),
    }))
  }
  switch (id) {
    case "ranger/C/G1":
      stage(point(boss), along(boss, axis, 91))
      break
    case "ranger/C/G2":
      stage(point(boss), along(actor, side, 65))
      break
    case "ranger/UC/G1":
      stage(along(actor, axis, 125), along(actor, axis, 235))
      break
    case "ranger/UC/G2":
      stage(point(boss), { x: aim.x - (boss.x - aim.x), y: boss.y })
      break
    case "ranger/R/G1": {
      const second = { x: boss.x + 99, y: boss.y - 63 }
      stage(point(boss), second, along(second, direction(boss, second), 96))
      break
    }
    case "ranger/E/G1":
      stage({ x: aim.x + 78, y: aim.y }, { x: aim.x + 133, y: aim.y - 27 })
      break
    case "ranger/E/G2": {
      const [first, second] = previewSkillAreas(battle, actor, active, aim)
      stage(first.center, along(second.center, direction(first.center, second.center), 85))
      break
    }
    case "ranger/L/G1":
      stage(point(boss), { x: aim.x + 111, y: aim.y - 65 })
      break
    case "ranger/Radiant/G1":
      stage(point(boss), { x: aim.x + 108, y: FIELD.top - 43 })
      break
    case "ranger/Radiant/G2":
      stage(inside(along(ally, direction(ally, actor), -109)))
      break
    case "ranger/Prismatic/G2":
      Object.assign(ally, inside(along(mirror(aim), { x: 1, y: 0 }, 74)))
      break
  }
}

export function queueRangerGold(battle: EdgeBattle, aim: EdgePoint, id: string, at: (time: number, play: () => void) => void) {
  if (id === "ranger/UC/G2") at(.46, () => {
    for (const dummy of battle.preview!.targets) dummy.move = inside(aim)
  })
  if (id === "ranger/Radiant/G1") at(.85, () =>
    forceTo(battle, battle.boss, { x: battle.boss.x, y: FIELD.top - 40 }, .24))
  if (id === "ranger/Radiant/G2") at(1.06, () => basicAttack(battle, battle.team[1], battle.boss))
}
