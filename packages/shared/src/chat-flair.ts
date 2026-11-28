/**
 * 聊天小彩蛋：给指定的 osu! 玩家每条发言后面补 😞😞😞。
 * 聊天室还没做，这里先放纯规则；以后发言接口在存消息前调用 applyChatFlair 即可。
 */

const SAD = "😞"
const SAD_SUFFIX = SAD.repeat(3)

/** 带彩蛋的 osu! 用户 id（https://osu.ppy.sh/users/35440492） */
const FLAIR_OSU_IDS: ReadonlySet<number> = new Set([35440492])

/**
 * 返回最终要发出去的文字。
 * 只对名单里的 osu! 用户生效；文字已经以 😞 结尾（忽略末尾空白）就不再补；空消息不补。
 */
export function applyChatFlair(osuId: number | string | null | undefined, text: string): string {
  if (osuId == null || !FLAIR_OSU_IDS.has(Number(osuId))) return text
  const body = text.trimEnd()
  if (body === "" || body.endsWith(SAD)) return text
  return body + SAD_SUFFIX
}
