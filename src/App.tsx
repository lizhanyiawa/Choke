import { CardEditor } from "@/card/CardEditor"
import { CardLab } from "@/card/CardLab"
import { DeskPage } from "@/desk/DeskPage"
import { PoolLab } from "@/pool/PoolLab"

export function App() {
  const path = window.location.pathname.replace(/\/+$/, "")
  if (path.endsWith("card-editor")) return <CardEditor />
  if (path.endsWith("pool-lab")) return <PoolLab />
  if (path.endsWith("card-lab")) return <CardLab />
  return <DeskPage />
}

export default App
