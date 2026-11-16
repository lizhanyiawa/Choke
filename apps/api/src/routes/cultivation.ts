import { randomInt, randomUUID } from "node:crypto"
import { and, eq, inArray, sql } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { GROWTH, JOBS, masteryLevel, modById, modSlots, newCultivation, rankOf, type CultivationProfile } from "../../../../src/card/cultivation"
import { COMBAT_VERSIONS, combatVersionOf } from "../../../../src/card/combatRules"
import { faceFromDef } from "../../../../src/card/def"
import { expToNext, isHeroCardId, levelCap } from "../../../../src/card/progression"
import type { Job, Rarity } from "../../../../src/card/types"
import { createEdgeBattle, issueEdgeOrder, moveEdgeFighter, SPARRING_STEP, stepEdgeBattle } from "../../../../src/battle/edgeBattle"
import { normalizeLoadout, poolForCard, type EdgeInputCard } from "../../../../src/battle/edgeSkills/catalog"
import { unitOf } from "../../../../src/battle/edgeSkills/state"
import { requireSelf } from "../auth/guard"
import { db } from "../db/client"
import { cards, combatRuleReleases, cultivationProfiles, cultivationRuns, userCards, users } from "../db/schema"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
class GrowthError extends Error {}
async function profile(tx: Tx, userId: string) {
  const [existing] = await tx.select().from(cultivationProfiles).where(eq(cultivationProfiles.userId, userId)).for("update")
  if (existing) return { ...existing.state, combatVersion: combatVersionOf(existing.state),
    equipment: Object.fromEntries(Object.entries(existing.state.equipment).map(([uid, mods]) => [uid, modSlots(mods)])) }
  const state = newCultivation()
  const [owner] = await tx.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId))
  const [release] = await tx.select().from(combatRuleReleases).where(eq(combatRuleReleases.version, "four-v2"))
  // Old accounts without the newly introduced profile also retain their original combat rules.
  if (!owner || !release || owner.createdAt <= release.introducedAt) state.combatVersion = "legacy-v1"
  await tx.insert(cultivationProfiles).values({ userId, state }).onConflictDoNothing()
  const [row] = await tx.select().from(cultivationProfiles).where(eq(cultivationProfiles.userId, userId)).for("update")
  return { ...row.state, combatVersion: combatVersionOf(row.state) }
}
async function save(tx: Tx, userId: string, state: CultivationProfile) {
  await tx.update(cultivationProfiles).set({ state }).where(eq(cultivationProfiles.userId, userId))
}
async function owned(tx: Tx, userId: string, id: number) {
  const [row] = await tx.select({ owned: userCards, definition: cards }).from(userCards)
    .innerJoin(cards, eq(cards.id, userCards.cardId)).where(and(eq(userCards.userId, userId), eq(userCards.id, id))).for("update")
  if (!row) throw new GrowthError("卡牌不属于当前账号")
  return row
}
const point = z.object({ x: z.number().finite().min(-2000).max(4000), y: z.number().finite().min(-2000).max(4000) }).strict()
const slots = z.tuple([z.number().int().min(0).max(30), z.number().int().min(0).max(30)])
const loadout = z.object({ active: slots, passive: slots, gold: z.number().int().min(0).max(10).nullable() }).strict()
const startSchema = z.object({ lineup: z.array(z.object({ uid: z.number().int().positive(), edge: loadout,
  edgePool: z.enum(["curated-v1", "curated-v2", "legacy-v1"]), combatVersion: z.enum(COMBAT_VERSIONS).optional() }).strict()).min(1).max(3) }).strict()
const command = z.object({ frame: z.number().int().min(0).max(GROWTH.pveSeconds * 60), unit: z.number().int().positive(),
  type: z.enum(["move", "basic", "skill", "skill2"]), target: z.union([z.number().int().positive(), z.literal("boss")]).optional(), at: point.optional() }).strict()
const settleSchema = z.object({ id: z.string().uuid(), commands: z.array(command).max(GROWTH.pveMaxCommands) }).strict()
const changeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rules"), combatVersion: z.enum(COMBAT_VERSIONS) }).strict(),
  z.object({ action: z.literal("title"), title: z.enum(JOBS).nullable() }).strict(),
  z.object({ action: z.literal("equip"), uid: z.number().int().positive(), mod: z.string().max(40), slot: z.number().int().min(0).max(GROWTH.modSlots - 1) }).strict(),
  z.object({ action: z.literal("unequip"), uid: z.number().int().positive(), slot: z.number().int().min(0).max(GROWTH.modSlots - 1) }).strict(),
  z.object({ action: z.literal("buy"), mod: z.string().max(40) }).strict(),
  z.object({ action: z.literal("rank"), uid: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("level"), uid: z.number().int().positive() }).strict(),
])
export async function cultivationRoutes(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError || error instanceof GrowthError) return reply.code(400).send({ ok: false, error: { code: "invalid_growth", message: error instanceof GrowthError ? error.message : "培养参数无效" } })
    const status = (error as { statusCode?: number }).statusCode
    if (typeof status === "number" && status >= 400 && status < 500) return reply.code(status).send({ ok: false, error: { code: "bad_request", message: "请求格式无效" } })
    app.log.error(error)
    return reply.code(500).send({ ok: false, error: { code: "growth_failed", message: "培养保存失败，请重试" } })
  })
  const self = (request: Parameters<typeof requireSelf>[0], reply: Parameters<typeof requireSelf>[1]) =>
    requireSelf(request, reply, z.object({ userId: z.string().min(1).max(200) }).parse(request.params).userId)
  app.get("/users/:userId/cultivation", async (request, reply) => {
    const userId = self(request, reply); if (!userId) return
    return { ok: true, data: await db.transaction(tx => profile(tx, userId)) }
  })
  app.post("/users/:userId/cultivation", async (request, reply) => {
    const userId = self(request, reply); if (!userId) return
    const body = changeSchema.parse(request.body)
    const data = await db.transaction(async tx => {
      const state = await profile(tx, userId)
      if (body.action === "rules") {
        state.combatVersion = body.combatVersion
      } else if (body.action === "title") {
        if (body.title && !masteryLevel(state.mastery[body.title])) throw new GrowthError("熟练度达到 100 才能装备称号")
        state.title = body.title
      } else if (body.action === "buy") {
        const mod = modById(body.mod)
        if (!mod || state.inventory.includes(mod.id) || state.training < mod.cost || state.clears < mod.clears) throw new GrowthError("Mod 尚未解锁、已持有或训练点不足")
        state.training -= mod.cost; state.inventory.push(mod.id)
      } else {
        const row = await owned(tx, userId, body.uid)
        if (body.action === "rank") {
          const rank = rankOf(row.owned.constellation), cost = GROWTH.rankCosts[rank]
          if (rank >= 5 || state.training < cost) throw new GrowthError("已达五阶或训练点不足")
          state.training -= cost
          await tx.update(userCards).set({ constellation: rank + 1 }).where(eq(userCards.id, body.uid))
        } else if (body.action === "level") {
          const { level, exp } = row.owned, hero = isHeroCardId(row.definition.id)
          const cost = expToNext(level, row.definition.rarity as Rarity, hero)
          if (level >= levelCap(hero) || exp < cost) throw new GrowthError("已满级或经验不足；通过 PvE 胜利获得经验")
          await tx.update(userCards).set({ level: level + 1, exp: exp - cost }).where(eq(userCards.id, body.uid))
        } else {
          const equipped = modSlots(state.equipment[body.uid])
          if (body.action === "equip") {
            if (!modById(body.mod) || !state.inventory.includes(body.mod)) throw new GrowthError("未持有这个 Mod")
            // A unique physical item moves; removing it never destroys it.
            for (const [uid, mods] of Object.entries(state.equipment)) state.equipment[uid] = mods.map(id => id === body.mod ? "" : id)
            const target = modSlots(state.equipment[body.uid])
            target[body.slot] = body.mod
            state.equipment[body.uid] = target.slice(0, GROWTH.modSlots)
          } else { equipped[body.slot] = ""; state.equipment[body.uid] = equipped }
        }
      }
      await save(tx, userId, state)
      return state
    })
    return { ok: true, data }
  })
  app.post("/users/:userId/cultivation/start", async (request, reply) => {
    const userId = self(request, reply); if (!userId) return
    const body = startSchema.parse(request.body)
    if (new Set(body.lineup.map(card => card.uid)).size !== body.lineup.length) throw new GrowthError("不能重复出战同一卡牌")
    const lineup = await db.transaction(async tx => {
      const state = await profile(tx, userId), id = randomUUID(), seed = randomInt(0, 2147483647)
      const lineup: EdgeInputCard[] = []
      for (const pick of body.lineup) {
        if (combatVersionOf(pick) !== state.combatVersion) throw new GrowthError("战斗规则已变化，请刷新战备后重试")
        const { owned: card, definition: def } = await owned(tx, userId, pick.uid)
        if (!JOBS.includes(def.job as Job)) throw new GrowthError("卡牌职业无效")
        const face = faceFromDef({ ...def, rarity: def.rarity as Rarity, job: def.job as Job, pp: def.pp === null ? null : Number(def.pp),
          country: def.country ?? undefined, art: def.art ?? undefined, banner: def.banner ?? undefined, profileUrl: def.profileUrl ?? undefined, skills: def.skills as [] }, { level: card.level, constellation: card.constellation, foil: card.foil })
        face.cultivation = { mods: (state.equipment[card.id] ?? []).filter(Boolean), title: { title: state.title, mastery: state.mastery } }
        const input: EdgeInputCard = { uid: card.id, cardId: def.id, face, edgePool: pick.edgePool,
          combatVersion: state.combatVersion, cultivationRun: { userId, id, seed } }
        const normalized = normalizeLoadout(poolForCard(input), pick.edge)
        if (JSON.stringify(normalized) !== JSON.stringify(pick.edge)) throw new GrowthError("技能配装或黄金搭配先决条件无效")
        input.edge = normalized; lineup.push(input)
      }
      // One active ticket per account prevents reloading old wins into a new reward.
      await tx.update(cultivationRuns).set({ settled: true }).where(and(eq(cultivationRuns.userId, userId), eq(cultivationRuns.settled, false)))
      await tx.insert(cultivationRuns).values({ id, userId, lineup })
      return lineup
    })
    return { ok: true, data: { lineup } }
  })
  app.post("/users/:userId/cultivation/settle", async (request, reply) => {
    const userId = self(request, reply); if (!userId) return
    const body = settleSchema.parse(request.body)
    const data = await db.transaction(async tx => {
      const state = await profile(tx, userId)
      const [run] = await tx.select().from(cultivationRuns).where(and(eq(cultivationRuns.id, body.id), eq(cultivationRuns.userId, userId))).for("update")
      if (!run) throw new GrowthError("战斗凭据无效")
      if (run.settled) { if (run.result) return { ...run.result, duplicate: true, profile: state }; throw new GrowthError("战斗凭据已由新战斗替代") }
      if (Date.now() - run.createdAt.getTime() > 86400000) throw new GrowthError("战斗凭据已过期")
      const battle = createEdgeBattle(run.lineup); battle.phase = "running"; battle.commands = undefined
      let frame = 0
      for (const action of body.commands) {
        if (action.frame < frame) throw new GrowthError("战斗指令顺序无效")
        while (frame < action.frame && battle.phase === "running") { stepEdgeBattle(battle, SPARRING_STEP); frame++ }
        const actor = battle.team.find(unit => unit.card.uid === action.unit)
        if (!actor || battle.phase !== "running") throw new GrowthError("战斗指令无效")
        const error = action.type === "move" ? action.at ? moveEdgeFighter(battle, actor, action.at) : "missing position"
          : issueEdgeOrder(battle, actor, action.type, action.target === undefined ? null : unitOf(battle, action.target) ?? null, action.at)
        if (error) throw new GrowthError("战斗回放验证失败，请从战备重新开始")
      }
      while (battle.phase === "running" && frame < GROWTH.pveSeconds * 60) { stepEdgeBattle(battle, SPARRING_STEP); frame++ }
      if (!(["won", "lost"] as string[]).includes(battle.phase)) throw new GrowthError("战斗尚未结束或超过 300 秒")
      if (battle.time * 800 > Date.now() - run.createdAt.getTime() + 2000) throw new GrowthError("战斗用时不符")
      const won = String(battle.phase) === "won", result = { won, training: won ? GROWTH.winTraining : 0, exp: won ? GROWTH.winExp : 0, mastery: won ? GROWTH.masteryPerWin : 0 }
      if (won) {
        state.training += result.training; state.clears++
        for (const job of new Set(run.lineup.map(card => card.face.job))) state.mastery[job] += result.mastery
        await tx.update(userCards).set({ exp: sql`${userCards.exp} + ${result.exp}` }).where(and(eq(userCards.userId, userId), inArray(userCards.id, run.lineup.map(card => card.uid))))
      }
      await save(tx, userId, state)
      await tx.update(cultivationRuns).set({ settled: true, result }).where(eq(cultivationRuns.id, run.id))
      return { ...result, duplicate: false, profile: state }
    })
    return { ok: true, data }
  })
}
