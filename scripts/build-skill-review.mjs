import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const folder = resolve(root, "Design", "技能演出")
const catalog = JSON.parse(await readFile(resolve(root, "src", "battle", "edgeSkills", "catalog.json"), "utf8"))
const records = JSON.parse(await readFile(resolve(folder, "记录.json"), "utf8"))
const labels = {
  bulwark: "肉坦", warden: "战坦", berserker: "狂战士", paladin: "圣骑士", spellbreaker: "破法者",
  ranger: "游侠", assassin: "刺客", warlock: "咒术师", lifebringer: "生术师", binder: "缚术师",
  summoner: "召唤师", dancer: "舞者", healer: "治疗师", bard: "吟游诗人",
}
const rarities = { C: "普通", UC: "非凡", R: "稀有", E: "史诗", L: "传说", Radiant: "辉光", Prismatic: "棱彩" }
const types = { active: ["A", "主动"], passive: ["P", "被动"], gold: ["G", "黄金"] }
const counts = { total: 0, designed: 0, implemented: 0, seen: 0, checked: 0 }
const known = new Set()
const sections = []
const esc = (value) => value.replaceAll("|", "\\|").replaceAll("\n", " ")

for (const [job, label] of Object.entries(labels)) {
  const rows = []
  for (const [rarity, rank] of Object.entries(rarities)) {
    rows.push(`### ${rank}（${rarity}）`, "", "| 技能 | 类型 | 演出设计 | 实装 | 验证 |", "| --- | --- | --- | --- | --- |")
    for (const [key, [prefix, type]] of Object.entries(types)) {
      for (const [index, skill] of catalog[job][rarity][key].entries()) {
        const slot = prefix + (index + 1)
        const id = [job, rarity, slot].join("/")
        const record = records[id] ?? {}
        if (record.implementation && !record.design || (record.runtime || record.visual) && !record.implementation) {
          throw new Error("Invalid review state for " + id)
        }
        known.add(id)
        counts.total++
        counts.designed += Number(!!record.design)
        counts.implemented += Number(!!record.implementation)
        counts.seen += Number(!!record.visual)
        counts.checked += Number(!!record.runtime)
        const preview = `http://127.0.0.1:5273/battle?from=lobby&view=skills&skill=${encodeURIComponent(id)}`
        const checks = [record.runtime, record.visual].filter(Boolean).join(" · ")
        rows.push(`| [${esc(skill.name)}](${preview}) \`${slot}\` | ${type} | ${esc(record.design ?? "待设计")} | ${esc(record.implementation ?? "待实装")} | ${esc(checks || "待验证")} |`)
      }
    }
    rows.push("")
  }
  sections.push(`<details>\n<summary>${label}（105）</summary>\n\n${rows.join("\n")}\n</details>`)
}

for (const id of Object.keys(records)) if (!known.has(id)) throw new Error("Unknown skill " + id)
if (counts.total !== 1470) throw new Error("Unexpected skill catalog size " + counts.total)
const header = [
  "# 技能演出进度",
  "",
  `共 **${counts.total}** 项。独立设计 **${counts.designed}**，实装 **${counts.implemented}**，结算回放核对 **${counts.checked}**，浏览器画面核对 **${counts.seen}**。`,
  "",
  "在测试号的战斗大厅打开「技能预览」。下表链接可直达各招。播放区可切换单招与队友接招，右上角「分镜」可逐阶段打开。",
  "",
  "改动记录保存在 [记录.json](记录.json)。在项目根目录运行 `node scripts/build-skill-review.mjs` 更新此表。机制和数值变更单列于 [结算调整.md](结算调整.md)。",
  "",
].join("\n")

await mkdir(folder, { recursive: true })
await writeFile(resolve(folder, "进度.md"), header + "\n" + sections.join("\n\n") + "\n")
console.log(counts)
