import { useMemo, useState } from "react"

import { CardFace } from "./CardFace"
import { DEMO_CARDS, ELEMENT_LABEL, JOB_LABEL, MOD_LIST, RARITY_LABEL } from "./data"
import type { CardFaceData, CardSkill, Element, Job, Mod, Rarity } from "./types"
import "./card-editor.css"

const RARITIES: Rarity[] = ["C", "UC", "R", "E", "L", "Radiant", "Prismatic"]
const JOBS: Job[] = ["tank", "warrior", "mage", "support"]
const ELEMENTS: Element[] = ["metal", "wood", "earth", "ice", "fire", "thunder", "light", "dark", "physical"]
type Holo = "none" | "regular" | "rainbow" | "glare"

interface SkillSlot {
  enabled: boolean
  name: string
  element: Element
  ap: number
  mp: string
  passive: boolean
}

function emptySlot(): SkillSlot {
  return { enabled: false, name: "", element: "physical", ap: 1, mp: "", passive: false }
}

function slotsFromCard(card: CardFaceData): SkillSlot[] {
  const slots = [0, 1, 2].map((i) => {
    const skill = card.skills[i]
    if (!skill) return emptySlot()
    return {
      enabled: true,
      name: skill.name,
      element: skill.element,
      ap: skill.ap,
      mp: skill.mp === undefined ? "" : String(skill.mp),
      passive: !!skill.passive,
    }
  })
  return slots
}

export function CardEditor() {
  const [base, setBase] = useState<CardFaceData>(DEMO_CARDS[4])
  const [slots, setSlots] = useState<SkillSlot[]>(slotsFromCard(DEMO_CARDS[4]))
  const [width, setWidth] = useState(420)
  const [guides, setGuides] = useState(false)
  const [holo, setHolo] = useState<Holo>("none")
  const [exported, setExported] = useState<string | null>(null)

  const card = useMemo<CardFaceData>(() => {
    const skills: CardSkill[] = slots
      .filter((slot) => slot.enabled && slot.name.trim().length > 0)
      .map((slot) => {
        const skill: CardSkill = {
          name: slot.name.trim(),
          element: slot.element,
          ap: slot.passive ? 0 : slot.ap,
        }
        if (slot.passive) skill.passive = true
        if (!slot.passive && slot.mp.trim() !== "" && Number.isFinite(Number(slot.mp))) {
          skill.mp = Number(slot.mp)
        }
        return skill
      })
    return { ...base, skills }
  }, [base, slots])

  function patch(patch: Partial<CardFaceData>) {
    setBase((prev) => ({ ...prev, ...patch }))
  }

  function patchSlot(index: number, patch: Partial<SkillSlot>) {
    setSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)))
  }

  function toggleMod(mod: Mod) {
    setBase((prev) => ({
      ...prev,
      mods: prev.mods.includes(mod) ? prev.mods.filter((m) => m !== mod) : [...prev.mods, mod],
    }))
  }

  function exportJson() {
    const json = JSON.stringify(card, null, 2)
    setExported(json)
    const blob = new Blob([json], { type: "application/json" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `${card.id || "card"}.json`
    link.click()
  }

  async function importJson(file: File | null) {
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text) as CardFaceData
      setBase(data)
      setSlots(slotsFromCard(data))
      setExported(null)
    } catch {
      setExported("导入失败：不是合法的卡面 JSON")
    }
  }

  return (
    <div className="editor">
      <aside className="editor__form">
        <header className="editor__head">
          <div className="editor__eyebrow">CHOKE! · CARD EDITOR</div>
          <h1>卡牌编辑器</h1>
          <p>左侧改，右侧实时预览。导出可以直接喂给卡池导入。</p>
        </header>

        <Section title="身份">
          <Field label="卡名">
            <input value={base.name} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <Row>
            <Field label="稀有度">
              <select value={base.rarity} onChange={(e) => patch({ rarity: e.target.value as Rarity })}>
                {RARITIES.map((r) => (
                  <option key={r} value={r}>
                    {r} · {RARITY_LABEL[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="职业">
              <select value={base.job} onChange={(e) => patch({ job: e.target.value as Job })}>
                {JOBS.map((j) => (
                  <option key={j} value={j}>
                    {JOB_LABEL[j]}
                  </option>
                ))}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="等级">
              <input
                type="number"
                min={1}
                max={80}
                value={base.level}
                onChange={(e) => patch({ level: Number(e.target.value) || 1 })}
              />
            </Field>
            <Field label="命座">
              <input
                type="number"
                min={0}
                max={12}
                value={base.constellation}
                onChange={(e) => patch({ constellation: Number(e.target.value) || 0 })}
              />
            </Field>
          </Row>
          <Row>
            <Field label="编号">
              <input
                type="number"
                min={0}
                value={base.no}
                onChange={(e) => patch({ no: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="总数">
              <input
                type="number"
                min={0}
                value={base.total}
                onChange={(e) => patch({ total: Number(e.target.value) || 0 })}
              />
            </Field>
          </Row>
          <Field label="MOD">
            <div className="editor__checks">
              {MOD_LIST.map((mod) => (
                <label key={mod}>
                  <input
                    type="checkbox"
                    checked={base.mods.includes(mod)}
                    onChange={() => toggleMod(mod)}
                  />
                  {mod}
                </label>
              ))}
            </div>
          </Field>
        </Section>

        <Section title="玩家信息">
          <Row>
            <Field label="国家">
              <input
                value={base.country ?? ""}
                maxLength={4}
                onChange={(e) => patch({ country: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="全球排名">
              <input
                type="number"
                min={0}
                value={base.globalRank ?? ""}
                onChange={(e) =>
                  patch({ globalRank: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </Field>
          </Row>
          <Field label="pp">
            <input
              type="number"
              min={0}
              step={0.1}
              value={base.pp ?? ""}
              onChange={(e) => patch({ pp: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </Field>
          <Field label="主页链接">
            <input
              value={base.profileUrl ?? ""}
              placeholder="https://osu.ppy.sh/users/..."
              onChange={(e) => patch({ profileUrl: e.target.value || undefined })}
            />
          </Field>
          <Field label="立绘地址">
            <input
              value={base.art ?? ""}
              placeholder="https://a.ppy.sh/..."
              onChange={(e) => patch({ art: e.target.value || undefined })}
            />
          </Field>
        </Section>

        <Section title="技能">
          {slots.map((slot, i) => (
            <div className="editor__slot" key={i} data-on={slot.enabled || undefined}>
              <label className="editor__slot-head">
                <input
                  type="checkbox"
                  checked={slot.enabled}
                  onChange={(e) => patchSlot(i, { enabled: e.target.checked })}
                />
                技能 {i + 1}
              </label>
              {slot.enabled && (
                <div className="editor__slot-body">
                  <Field label="名称">
                    <input
                      value={slot.name}
                      onChange={(e) => patchSlot(i, { name: e.target.value })}
                    />
                  </Field>
                  <Row>
                    <Field label="属性">
                      <select
                        value={slot.element}
                        onChange={(e) => patchSlot(i, { element: e.target.value as Element })}
                      >
                        {ELEMENTS.map((el) => (
                          <option key={el} value={el}>
                            {ELEMENT_LABEL[el]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="AP">
                      <input
                        type="number"
                        min={0}
                        max={9}
                        disabled={slot.passive}
                        value={slot.ap}
                        onChange={(e) => patchSlot(i, { ap: Number(e.target.value) || 0 })}
                      />
                    </Field>
                    <Field label="MP">
                      <input
                        type="number"
                        min={0}
                        max={99}
                        placeholder="无"
                        disabled={slot.passive}
                        value={slot.mp}
                        onChange={(e) => patchSlot(i, { mp: e.target.value })}
                      />
                    </Field>
                  </Row>
                  <label className="editor__inline">
                    <input
                      type="checkbox"
                      checked={slot.passive}
                      onChange={(e) => patchSlot(i, { passive: e.target.checked })}
                    />
                    被动技能
                  </label>
                </div>
              )}
            </div>
          ))}
        </Section>

        <Section title="预览">
          <Field label={`宽度 ${width}px`}>
            <input
              type="range"
              min={240}
              max={640}
              step={10}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </Field>
          <label className="editor__inline">
            <input
              type="checkbox"
              checked={guides}
              onChange={(e) => setGuides(e.target.checked)}
            />
            显示布局参考线
          </label>
          <Field label="全息效果">
            <select value={holo} onChange={(e) => setHolo(e.target.value as Holo)}>
              <option value="none">无</option>
              <option value="regular">常规箔面</option>
              <option value="rainbow">彩虹箔</option>
              <option value="glare">斜光</option>
            </select>
          </Field>
          <div className="editor__actions">
            <button type="button" onClick={exportJson}>
              导出 JSON
            </button>
            <label className="editor__upload">
              导入 JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => importJson(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          {exported && <pre className="editor__out">{exported.slice(0, 1200)}</pre>}
        </Section>
      </aside>

      <main className="editor__preview">
        <div
          className="editor__stage"
          data-holo={holo === "none" ? undefined : holo}
          style={{ width }}
        >
          <CardFace card={card} className={guides ? "cf--guides" : undefined} />
        </div>

        <div className="editor__zoom">
          <button type="button" onClick={() => setWidth((w) => Math.max(240, w - 40))} aria-label="缩小">
            −
          </button>
          <span>{width}</span>
          <button type="button" onClick={() => setWidth((w) => Math.min(640, w + 40))} aria-label="放大">
            +
          </button>
        </div>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="editor__section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="editor__field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="editor__row">{children}</div>
}
