import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const jobs = [
  ["肉坦", "bulwark"], ["战坦", "warden"], ["狂战士", "berserker"], ["圣骑士", "paladin"],
  ["破法者", "spellbreaker"], ["游侠", "ranger"], ["刺客", "assassin"], ["咒术师", "warlock"],
  ["生术师", "lifebringer"], ["缚术师", "binder"], ["召唤师", "summoner"], ["舞者", "dancer"],
  ["治疗师", "healer"], ["吟游诗人", "bard"],
]
const tiers = { Common: "C", Uncommon: "UC", Rare: "R", Epic: "E", Legendary: "L", Radiant: "Radiant", Prismatic: "Prismatic" }

function readPool(section, label) {
  const pool = { active: [], passive: [], gold: [] }
  for (const line of section.split(/\r?\n/)) {
    if (!line.startsWith("| ")) continue
    const [slot, name, description, art] = line.slice(1, -1).split("|").map((cell) => cell.trim().replaceAll("**", ""))
    if (/^A[1-5]$/.test(slot)) pool.active.push({ name, description, art })
    if (/^P[1-8]$/.test(slot)) pool.passive.push({ name, description })
    const pair = /^A([1-5]) (.+?) \+ P([1-8]) (.+)$/.exec(slot)
    if (pair) {
      const active = Number(pair[1]) - 1
      const passive = Number(pair[3]) - 1
      if (pool.active[active]?.name !== pair[2] || pool.passive[passive]?.name !== pair[4]) {
        throw new Error(label + " has an invalid gold pairing: " + slot)
      }
      pool.gold.push({ active, passive, name, description, art })
    }
  }
  if (pool.active.length !== 5 || pool.passive.length !== 8 || pool.gold.length !== 2) {
    throw new Error(label + " must contain 5 actives, 8 passives and 2 gold pairings")
  }
  return pool
}

const result = Object.fromEntries(await Promise.all(jobs.map(async ([name, id], index) => {
  const filename = String(index + 1).padStart(2, "0") + "-" + name + ".md"
  const document = await readFile(resolve(root, "Design", "边线技能池", filename), "utf8")
  const sections = [...document.matchAll(/^## (\w+)\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)]
  if (sections.length !== 7) throw new Error(filename + " must contain seven rarity headings")
  const pool = Object.fromEntries(sections.map(([, title, content]) => {
    if (!tiers[title]) throw new Error(filename + " has unknown rarity: " + title)
    return [tiers[title], readPool(content, name + " " + title)]
  }))
  return [id, pool]
})))

await writeFile(resolve(root, "src/battle/edgeSkills/catalog.json"), JSON.stringify(result) + "\n")
