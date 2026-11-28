import { useFlat } from "@/flat/context"
import { DeckCard } from "@/flat/home/DeckCard"
import { ExpeditionCard, useCurrentExpedition } from "@/flat/home/ExpeditionCard"
import { NextUnlockCard } from "@/flat/home/NextUnlockCard"
import { PacksCard } from "@/flat/home/PacksCard"
import { SupplyCard } from "@/flat/home/SupplyCard"
import { TodayCard } from "@/flat/home/TodayCard"
import { OsuDailyCard } from "@/flat/quests/OsuDailyCard"
import { OSU_DAILY_SLOT } from "@/flat/quests/QuestRow"
import { useQuests } from "@/flat/quests/store"

import "./home.css"

/** 首页：今天能做什么一眼看完。每张卡只管自己那一块数据 */
export function HomePage() {
  const { user, packs } = useFlat()
  const { data: quests } = useQuests()
  const expedition = useCurrentExpedition(user.id)

  // 这一页唯一的粉色主按钮给谁：有没结束的远征 → 继续远征；否则手上有卡包 → 开包；否则 → 去远征。
  // 远征和卡包都有了着落再定，免得粉色按钮先亮在一处、又跳到另一处
  const current = expedition.state.status === "ready" ? expedition.state.current : null
  const hasPacks = packs !== null && Object.values(packs).some((count) => count > 0)
  const primary =
    expedition.state.status === "loading" || packs === null
      ? null
      : current
        ? "expedition"
        : hasPacks
          ? "packs"
          : // 远征取不回来时那张卡上没有按钮，粉色就不给谁了
            expedition.state.status === "ready"
            ? "expedition"
            : null

  return (
    <div className="fl-page home-page">
      <div className="home-grid">
        <div className="home-col">
          <ExpeditionCard {...expedition} primary={primary === "expedition"} />
          <TodayCard />
        </div>
        <div className="home-col">
          <SupplyCard />
          <PacksCard primary={primary === "packs"} />
          {/* 「今日」卡里推荐谱面那条任务的「前往」滚到这里。
              要等任务总览取回来再放：key 是日常的重置时间，过了一天就换一张新卡，让它重新取 */}
          <div className="home-slot" id={OSU_DAILY_SLOT}>
            {quests && <OsuDailyCard key={quests.signIn.today} />}
          </div>
          <NextUnlockCard />
        </div>
        <DeckCard />
      </div>
    </div>
  )
}
