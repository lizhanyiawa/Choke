import { JOB_ORDER, isCustomBanner } from "@/card/data"
import type { CardFaceData } from "@/card/types"

import { fetchCardDetail, toFace, type OpenPackResult } from "@/desk/session/api"

type PulledCard = OpenPackResult["results"][number]

/**
 * 开包结果转卡面。卡包已经核销、卡已入库，所以一张详情拉不下来也不能丢：
 * 退回用结果里自带的字段拼一张最小卡面，保证每张卡都能展示出来。
 */
async function faceOfPulled(item: PulledCard): Promise<CardFaceData> {
  const instance = {
    userCardId: item.userCardId,
    level: 1,
    constellation: 0,
    exp: 0,
    foil: item.foil,
    serial: item.serial,
    rollBp: item.rollBp,
    skillRefs: item.skillRefs,
  }
  try {
    const detail = await fetchCardDetail(item.cardId)
    return toFace({ ...detail, ...instance, pulled: detail.pulled ?? item.pulled })
  } catch {
    return toFace({
      ...instance,
      id: item.cardId,
      name: "卡牌信息加载失败",
      rarity: item.rarity ?? "C",
      job: JOB_ORDER[0],
      no: 0,
      total: 0,
      country: null,
      globalRank: null,
      pp: null,
      profileUrl: null,
      art: null,
      banner: null,
      version: 1,
      pulled: item.pulled,
    })
  }
}

/** 留着引用，解码好的图才不会被马上回收 */
const preloaded: HTMLImageElement[] = []

function preloadCardArt(faces: CardFaceData[]) {
  for (const face of faces) {
    for (const src of [face.art, isCustomBanner(face.banner) ? face.banner : undefined]) {
      if (!src) continue
      const image = new Image()
      image.referrerPolicy = "no-referrer"
      image.src = src
      image.decode().catch(() => {})
      preloaded.push(image)
    }
  }
  if (preloaded.length > 40) preloaded.splice(0, preloaded.length - 40)
}

/** 永不抛错；结果顺序和 results 一致，并顺手预加载、解码卡图 */
export async function resolvePulledCards(results: OpenPackResult["results"]): Promise<CardFaceData[]> {
  const faces = await Promise.all(results.map(faceOfPulled))
  preloadCardArt(faces)
  return faces
}
