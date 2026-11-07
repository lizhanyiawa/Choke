import type { FastifyInstance } from "fastify"
import { z } from "zod"

import { openPack } from "../gacha/open"
import { POOL_NAMES, POOL_WEIGHTS, type PoolId } from "../gacha/pools"

const poolIds = Object.keys(POOL_WEIGHTS) as [PoolId, ...PoolId[]]

export async function packRoutes(app: FastifyInstance) {
  app.get("/packs", async () => {
    return {
      ok: true,
      data: poolIds.map((id) => ({
        id,
        name: POOL_NAMES[id],
        weights: POOL_WEIGHTS[id],
      })),
    }
  })

  app.post("/packs/:pool/open", async (request, reply) => {
    const params = z.object({ pool: z.enum(poolIds) }).safeParse(request.params)
    const body = z
      .object({
        userId: z.string().min(1).max(64),
        count: z.number().int().min(1).max(10).optional(),
      })
      .safeParse(request.body)

    if (!params.success || !body.success) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "bad_request",
          message: params.success ? "body 不合法" : "pool 不合法",
          details: params.success
            ? body.success
              ? null
              : body.error.flatten()
            : params.error.flatten(),
        },
      })
    }

    try {
      const result = await openPack(body.data.userId, params.data.pool, body.data.count ?? 5)
      return { ok: true, data: result }
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({
        ok: false,
        error: {
          code: "open_failed",
          message: error instanceof Error ? error.message : "抽卡失败",
        },
      })
    }
  })
}
