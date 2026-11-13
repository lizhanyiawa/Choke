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
    background: [
      "linear-gradient(165deg, rgb(255 255 255 / 0.05), transparent 46%, rgb(0 0 0 / 0.14))",
      "repeating-linear-gradient(0deg, rgb(255 255 255 / 0.025) 0 1px, transparent 1px 3px)",
      "repeating-linear-gradient(90deg, rgb(0 0 0 / 0.07) 0 1px, transparent 1px 3px)",
      "#2b2331",
    ].join(", "),
    blend: "normal, normal, normal, normal",
    edge: "#3a2f42",
  },
]

export const DEFAULT_SKIN = SKINS[0]
