export interface DeskSkin {
  id: string
  name: string
  /** 桌面背景，CSS background 值；换贴图时改成 url(...) 即可 */
  background: string
  /** 桌面边缘（桌沿）颜色 */
  edge: string
}

/** 桌面皮肤：之后的桌垫 / 环境只需要在这里加一项 */
export const SKINS: DeskSkin[] = [
  {
    id: "walnut",
    name: "胡桃木（占位）",
    background:
      "radial-gradient(ellipse at 50% 35%, #7A4A2A 0%, #5B3320 70%, #45261A 100%)",
    edge: "#3E2212",
  },
]

export const DEFAULT_SKIN = SKINS[0]
