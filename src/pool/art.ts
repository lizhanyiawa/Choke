/** 头像地址可按 id 拼。浏览器渲染卡面时再去拉，这里不下图片。 */
export function avatarUrl(osuId: number): string {
  return `https://a.ppy.sh/${osuId}`
}

export function profileUrl(osuId: number): string {
  return `https://osu.ppy.sh/users/${osuId}`
}
