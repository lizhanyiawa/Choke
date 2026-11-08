import { CardEditor } from "@/card/CardEditor"
import { CardLab } from "@/card/CardLab"
import { BattlePage } from "@/battle/BattlePage"
import { DeskPage } from "@/desk/DeskPage"
import { GachaPage } from "@/gacha/GachaPage"
import { IntroPage } from "@/intro/IntroPage"
import { PoolLab } from "@/pool/PoolLab"

export function App() {
  const path = window.location.pathname.replace(/\/+$/, "")
  if (path.endsWith("intro")) return <IntroPage />
  if (path.endsWith("battle")) return <BattlePage />
  if (path.endsWith("gacha")) return <GachaPage />
  if (path.endsWith("card-editor")) return <CardEditor />
  if (path.endsWith("pool-lab")) return <PoolLab />
  if (path.endsWith("card-lab")) return <CardLab />
  return <DeskPage />
}

export default App
