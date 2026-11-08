import { CardEditor } from "@/card/CardEditor"
import { BattlePage } from "@/battle/BattlePage"
import { BackToDesk } from "@/components/BackToDesk"
import { DeskPage } from "@/desk/DeskPage"
import { IntroPage } from "@/intro/IntroPage"
import { PoolLab } from "@/pool/PoolLab"

export function App() {
  const path = window.location.pathname.replace(/\/+$/, "")
  if (path.endsWith("intro")) return <IntroPage />
  if (path.endsWith("battle")) {
    return (
      <>
        <BattlePage />
        <BackToDesk />
      </>
    )
  }
  if (path.endsWith("gacha")) {
    window.history.replaceState(null, "", "/?panel=packs")
    return <DeskPage />
  }
  if (path.endsWith("card-lab")) {
    window.history.replaceState(null, "", "/?panel=about")
    return <DeskPage />
  }
  if (path.endsWith("card-editor")) {
    return (
      <>
        <CardEditor />
        <BackToDesk />
      </>
    )
  }
  if (path.endsWith("pool-lab")) {
    return (
      <>
        <PoolLab />
        <BackToDesk />
      </>
    )
  }
  return <DeskPage />
}

export default App
