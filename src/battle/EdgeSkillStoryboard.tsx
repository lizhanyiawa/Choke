import { useMemo, useState } from "react"
import { RiArrowLeftLine } from "@remixicon/react"

import { RARITY_LABEL } from "@/card/data"
import { SUBJOBS, type SubJobId } from "@/card/jobs"
import type { Rarity } from "@/card/types"
import { EdgeBoard } from "./EdgeArena"
import { EDGE_RARITIES } from "./edgeSkills/catalog"
import type { SkillPreviewEntry, SkillPreviewScene } from "./edgeSkills/preview"
import { reviewFrames } from "./edgeSkills/reviewFrames"

const kindLabels = { active: "主动", passive: "被动", gold: "黄金" }

function previewHref(skill: string, scene: SkillPreviewScene, time?: number) {
  const query = new URLSearchParams(window.location.search)
  query.delete("sheet")
  query.set("skill", skill)
  if (scene === "squad") query.set("scene", "squad")
  else query.delete("scene")
  if (time === undefined) query.delete("t")
  else query.set("t", String(time))
  return "?" + query
}

function SkillStrip({ entry, scene }: { entry: SkillPreviewEntry; scene: SkillPreviewScene }) {
  const frames = useMemo(() => reviewFrames(entry, scene), [entry, scene])
  return (
    <section className="edge-storyboard__strip" aria-label={entry.skill.name}>
      <h2><a href={previewHref(entry.skill.id, scene)}>{entry.skill.name}</a></h2>
      <div className="edge-storyboard__frames">
        {frames.map(({ name, time, battle, viewBox }) => (
          <a key={name} href={previewHref(entry.skill.id, scene, time)} className="edge-storyboard__frame"
            aria-label={entry.skill.name + " " + name} data-frame={name} data-skill={entry.skill.id}>
            <span>{name}<small>{time.toFixed(2)}s</small></span>
            <EdgeBoard battle={battle} selected={battle.team[0]} viewBox={viewBox} />
          </a>
        ))}
      </div>
    </section>
  )
}

export function EdgeSkillStoryboard({ library, focus, initialScene }: {
  library: SkillPreviewEntry[]; focus: SkillPreviewEntry; initialScene: SkillPreviewScene
}) {
  const [job, setJob] = useState(focus.job)
  const [rarity, setRarity] = useState(focus.rarity)
  const [kind, setKind] = useState(focus.kind)
  const [scene, setScene] = useState(initialScene)
  const entries = library.filter((entry) => entry.job === job && entry.rarity === rarity && entry.kind === kind)
  return (
    <div className="battle-page edge-preview">
      <header className="client-header battle-top">
        <a className="battle-back" href={previewHref(entries[0]?.skill.id ?? focus.skill.id, scene)}>
          <RiArrowLeftLine size={19} aria-hidden />技能预览
        </a>
        <b>技能分镜</b>
      </header>
      <main className="edge-storyboard">
        <div className="edge-storyboard__filters client-panel">
          <select className="client-select" aria-label="子职业" value={job} onChange={(event) => setJob(event.target.value as SubJobId)}>
            {Object.values(SUBJOBS).map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select className="client-select" aria-label="稀有度" value={rarity} onChange={(event) => setRarity(event.target.value as Rarity)}>
            {EDGE_RARITIES.map((rank) => <option key={rank} value={rank}>{RARITY_LABEL[rank]}</option>)}
          </select>
          <select className="client-select" aria-label="技能类型" value={kind} onChange={(event) => setKind(event.target.value as SkillPreviewEntry["kind"])}>
            {Object.entries(kindLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select className="client-select" aria-label="预览场景" value={scene} onChange={(event) => setScene(event.target.value as SkillPreviewScene)}>
            <option value="sample">单招</option>
            <option value="squad">队友接招</option>
          </select>
        </div>
        {entries.map((entry) => <SkillStrip key={entry.skill.id} entry={entry} scene={scene} />)}
      </main>
    </div>
  )
}
