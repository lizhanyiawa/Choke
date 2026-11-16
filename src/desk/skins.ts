export interface DeskSkin {
  id: string
  name: string
  /** 桌面背景，CSS background 值；换成照片贴图时改 url(...) 即可 */
  background: string
  /** 与 background 一一对应的 background-blend-mode */
  blend: string
  /** 垫子包边的颜色 */
  edge: string
}

/** 桌面皮肤：之后的桌垫 / 环境只需要在这里加一项 */
export const SKINS: DeskSkin[] = [
  {
    id: "plum",
    name: "紫黑对战垫",
    // 偏冷的灰紫布面：左上受光的线性明暗 + 两层细线叠成的布纹，不加光晕和印花
    background: "var(--client-felt)",
    blend: "normal, normal, normal, normal",
    edge: "var(--client-felt-edge)",
  },
]

export const DEFAULT_SKIN = SKINS[0]
