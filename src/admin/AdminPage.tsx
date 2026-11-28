import { useCallback, useEffect, useState } from "react"

import { CONTENT, MYSTERY_PACK_ID } from "@choke/shared/content"
import { ITEMS, type ItemId } from "@choke/shared/items"
import {
  ADMIN_ATTACHMENT_LIMITS,
  MAIL_BODY_MAX,
  MAIL_TITLE_MAX,
  type MailAttachment,
  type MailAudience,
  type MailKind,
} from "@choke/shared/mail"

import { playSfx } from "@/audio/sfx"
import { PageLoading } from "@/components/PageLoading"
import { ApiError, fetchMe } from "@/desk/session/api"

import {
  fetchBatches,
  previewAudience,
  searchUsers,
  sendAdminMail,
  type AdminBatch,
  type AdminUserRow,
} from "./api"

import "@/desk/book.css"
import "./admin.css"

type Gate = "loading" | "anon" | "denied" | "error" | "ok"
type AudienceType = MailAudience["type"]

const ITEM_OPTIONS = Object.values(ITEMS)
const PACK_OPTIONS = [
  ...Object.entries(CONTENT.packs.packs).map(([id, pack]) => ({ id, name: pack.name })),
  { id: MYSTERY_PACK_ID as string, name: CONTENT.packs.mystery.name },
]
const packName = (id: string) => PACK_OPTIONS.find((pack) => pack.id === id)?.name ?? id

interface Row {
  key: number
  id: string
  count: string
  foil?: boolean
}

interface Form {
  audience: AudienceType
  users: { id: string; username: string }[]
  minLevel: string
  kind: Extract<MailKind, "system" | "reward">
  title: string
  body: string
  coins: string
  essence: string
  items: Row[]
  packs: Row[]
  cards: Row[]
}

const EMPTY_FORM: Form = {
  audience: "users",
  users: [],
  minLevel: "10",
  kind: "system",
  title: "",
  body: "",
  coins: "",
  essence: "",
  items: [],
  packs: [],
  cards: [],
}

let rowKey = 0
const newRow = (id = "", count = "1"): Row => ({ key: (rowKey += 1), id, count })

const positiveInt = (text: string): number | undefined => {
  const value = Math.floor(Number(text))
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function buildAudience(form: Form): MailAudience {
  if (form.audience === "all") return { type: "all" }
  if (form.audience === "level") return { type: "level", minLevel: positiveInt(form.minLevel) ?? 1 }
  return { type: "users", userIds: form.users.map((user) => user.id) }
}

function buildAttachment(form: Form): MailAttachment | null {
  const attachment: MailAttachment = {}
  const coins = positiveInt(form.coins)
  const essence = positiveInt(form.essence)
  if (coins) attachment.coins = coins
  if (essence) attachment.essence = essence
  const items = form.items.flatMap((row) => {
    const count = positiveInt(row.count)
    return row.id && count ? [{ itemId: row.id as ItemId, count }] : []
  })
  if (items.length) attachment.items = items
  const packs = form.packs.flatMap((row) => {
    const count = positiveInt(row.count)
    return row.id && count ? [{ pool: row.id, count }] : []
  })
  if (packs.length) attachment.packs = packs
  const cards = form.cards.flatMap((row) => {
    const count = positiveInt(row.count)
    return row.id.trim() && count ? [{ cardId: row.id.trim(), count, ...(row.foil ? { foil: true } : {}) }] : []
  })
  if (cards.length) attachment.cards = cards
  return Object.keys(attachment).length ? attachment : null
}

function attachmentLines(attachment: MailAttachment | null): string[] {
  if (!attachment) return []
  const lines: string[] = []
  if (attachment.coins) lines.push(`金币 ×${attachment.coins}`)
  if (attachment.essence) lines.push(`闪卡精华 ×${attachment.essence}`)
  for (const item of attachment.items ?? []) lines.push(`${ITEMS[item.itemId]?.name ?? item.itemId} ×${item.count}`)
  for (const pack of attachment.packs ?? []) lines.push(`${packName(pack.pool)} ×${pack.count}`)
  for (const card of attachment.cards ?? []) lines.push(`卡牌 ${card.cardId}${card.foil ? "（闪）" : ""} ×${card.count}`)
  return lines
}

function audienceLabel(audience: MailAudience): string {
  if (audience.type === "all") return "全体玩家"
  if (audience.type === "level") return `等级 ≥ ${audience.minLevel}`
  return audience.userIds.length <= 3 ? audience.userIds.join("、") : `${audience.userIds.length} 名指定玩家`
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const errorText = (reason: unknown) => (reason instanceof Error ? reason.message : "操作失败")

export function AdminPage() {
  const [gate, setGate] = useState<Gate>("loading")
  const [name, setName] = useState("")

  useEffect(() => {
    fetchMe()
      .then((me) => {
        setName(me.username)
        setGate(me.isAdmin ? "ok" : "denied")
      })
      .catch((reason: unknown) =>
        setGate(reason instanceof ApiError && reason.code === "unauthorized" ? "anon" : "error"),
      )
  }, [])

  if (gate === "loading") return <PageLoading label="检查账号中" />
  if (gate !== "ok") {
    const message = {
      anon: "请先登录管理员账号。",
      denied: "这个账号没有管理员权限。",
      error: "暂时连不上服务器，请稍后刷新重试。",
    }[gate]
    return (
      <main className="admin-page admin-page--gate">
        <div className="admin-gate">
          <span className="bk-label">ADMIN</span>
          <h1>管理后台</h1>
          <p className="bk-note">{message}</p>
          <div className="admin-gate__actions">
            {gate === "anon" && (
              <a className="bk-btn bk-btn--main" href="/login">
                去登录
              </a>
            )}
            <a className="bk-btn bk-btn--ghost" href="/home">
              返回桌面
            </a>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="admin-page">
      <header className="admin-head">
        <div>
          <span className="bk-label">ADMIN</span>
          <h1>管理后台</h1>
        </div>
        <div className="admin-head__user">
          <span className="bk-note">{name}</span>
          <a className="bk-btn bk-btn--ghost bk-btn--sm" href="/home">
            返回桌面
          </a>
        </div>
      </header>
      <MailComposer />
    </main>
  )
}

function RowEditor({
  label,
  rows,
  onChange,
  options,
  idPlaceholder,
  foilToggle,
}: {
  label: string
  rows: Row[]
  onChange: (rows: Row[]) => void
  options?: { id: string; name: string }[]
  idPlaceholder?: string
  foilToggle?: boolean
}) {
  const update = (key: number, patch: Partial<Row>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  return (
    <div className="admin-field">
      <span className="bk-label">{label}</span>
      {rows.map((row) => (
        <div className="admin-row" key={row.key}>
          {options ? (
            <select value={row.id} onChange={(event) => update(row.key, { id: event.target.value })}>
              <option value="">选择…</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={row.id}
              placeholder={idPlaceholder}
              onChange={(event) => update(row.key, { id: event.target.value })}
            />
          )}
          <input
            className="admin-row__count"
            type="number"
            min={1}
            value={row.count}
            aria-label="数量"
            onChange={(event) => update(row.key, { count: event.target.value })}
          />
          {foilToggle && (
            <label className="admin-check">
              <input
                type="checkbox"
                checked={!!row.foil}
                onChange={(event) => update(row.key, { foil: event.target.checked })}
              />
              闪卡
            </label>
          )}
          <button
            type="button"
            className="bk-btn bk-btn--ghost bk-btn--sm"
            onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
          >
            删除
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          className="bk-btn bk-btn--sm"
          onClick={() => onChange([...rows, newRow()])}
        >
          + 添加
        </button>
      </div>
    </div>
  )
}

function MailComposer() {
  const [form, setForm] = useState<Form>(EMPTY_FORM)
  const [query, setQuery] = useState("")
  const [found, setFound] = useState<AdminUserRow[]>([])
  const [searched, setSearched] = useState(false)
  const [pending, setPending] = useState<{ recipients: number; sample: { id: string; username: string }[] } | null>(null)
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [batches, setBatches] = useState<AdminBatch[] | null>(null)

  const patch = (next: Partial<Form>) => setForm((prev) => ({ ...prev, ...next }))

  const loadBatches = useCallback(() => {
    fetchBatches()
      .then((data) => setBatches(data.batches))
      .catch(() => setBatches([]))
  }, [])
  useEffect(() => {
    loadBatches()
  }, [loadBatches])

  /** 出错：提示条 + 一声错误音 */
  const fail = (text: string) => {
    playSfx("error")
    setError(text)
  }

  const runSearch = async () => {
    if (!query.trim()) return
    setError(null)
    try {
      setFound((await searchUsers(query.trim())).users)
      setSearched(true)
    } catch (reason) {
      fail(errorText(reason))
    }
  }

  const addUser = (user: AdminUserRow) => {
    if (form.users.some((u) => u.id === user.id)) return
    patch({ users: [...form.users, { id: user.id, username: user.username }] })
  }

  const attachment = buildAttachment(form)
  const lines = attachmentLines(attachment)
  const needTyped = form.audience !== "users"

  const startPreview = async () => {
    setError(null)
    setDone(null)
    if (!form.title.trim()) return fail("标题不能为空")
    if (form.audience === "users" && form.users.length === 0) return fail("请先添加收件人")
    if (form.audience === "level" && !positiveInt(form.minLevel)) return fail("请填写等级")
    setBusy(true)
    try {
      setPending(await previewAudience(buildAudience(form)))
      setTyped("")
      playSfx("paper")
    } catch (reason) {
      fail(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  const confirmSend = async () => {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      const result = await sendAdminMail({
        audience: buildAudience(form),
        kind: form.kind,
        title: form.title.trim(),
        body: form.body,
        attachment,
        confirmCount: pending.recipients,
      })
      playSfx("send")
      setDone(`已发送给 ${result.recipients} 名玩家（批次 #${result.batchId}）`)
      setPending(null)
      setForm(EMPTY_FORM)
      setFound([])
      setSearched(false)
      loadBatches()
    } catch (reason) {
      fail(errorText(reason))
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  const limits = ADMIN_ATTACHMENT_LIMITS

  return (
    <div className="admin-grid">
      <section className="admin-card">
        <h2>发邮件</h2>
        <fieldset className="admin-form" disabled={busy || !!pending}>
          <div className="admin-field">
            <span className="bk-label">收件人</span>
            <div className="admin-tabs" role="group" aria-label="收件人类型">
              {(
                [
                  ["users", "指定玩家"],
                  ["level", "按等级"],
                  ["all", "全体玩家"],
                ] as const
              ).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  className="bk-chip"
                  aria-pressed={form.audience === type}
                  onClick={() => patch({ audience: type })}
                >
                  {label}
                </button>
              ))}
            </div>

            {form.audience === "users" && (
              <>
                <div className="admin-row">
                  <input
                    value={query}
                    placeholder="按名字、用户 id 或数字 ID 搜索"
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        void runSearch()
                      }
                    }}
                  />
                  <button type="button" className="bk-btn bk-btn--sm" onClick={() => void runSearch()}>
                    搜索
                  </button>
                </div>
                {searched && found.length === 0 && <p className="bk-note">没有找到玩家。</p>}
                {found.length > 0 && (
                  <ul className="admin-results">
                    {found.map((user) => (
                      <li key={user.id}>
                        <span>
                          {user.username} <span className="bk-note">#{user.publicId} · Lv.{user.level} · {user.id}</span>
                        </span>
                        <button
                          type="button"
                          className="bk-btn bk-btn--sm"
                          disabled={form.users.some((u) => u.id === user.id)}
                          onClick={() => addUser(user)}
                        >
                          {form.users.some((u) => u.id === user.id) ? "已添加" : "添加"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="admin-chips">
                  {form.users.length === 0 && <span className="bk-note">还没有收件人。</span>}
                  {form.users.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className="admin-tag"
                      title="点击移除"
                      onClick={() => patch({ users: form.users.filter((u) => u.id !== user.id) })}
                    >
                      {user.username} ×
                    </button>
                  ))}
                </div>
              </>
            )}

            {form.audience === "level" && (
              <label className="admin-row">
                <span>玩家等级不低于</span>
                <input
                  className="admin-row__count"
                  type="number"
                  min={1}
                  value={form.minLevel}
                  onChange={(event) => patch({ minLevel: event.target.value })}
                />
              </label>
            )}
            {form.audience === "all" && <p className="bk-note">会发给所有账号（含游客）。发送前需要二次确认。</p>}
          </div>

          <div className="admin-field">
            <span className="bk-label">类型</span>
            <select value={form.kind} onChange={(event) => patch({ kind: event.target.value as Form["kind"] })}>
              <option value="system">系统通知</option>
              <option value="reward">奖励</option>
            </select>
          </div>

          <label className="admin-field">
            <span className="bk-label">标题（{form.title.length}/{MAIL_TITLE_MAX}）</span>
            <input
              value={form.title}
              maxLength={MAIL_TITLE_MAX}
              onChange={(event) => patch({ title: event.target.value })}
            />
          </label>

          <label className="admin-field">
            <span className="bk-label">正文（纯文本，{form.body.length}/{MAIL_BODY_MAX}）</span>
            <textarea
              rows={6}
              value={form.body}
              maxLength={MAIL_BODY_MAX}
              onChange={(event) => patch({ body: event.target.value })}
            />
          </label>

          <div className="admin-field">
            <span className="bk-label">附件（单封上限：金币 {limits.coins}、精华 {limits.essence}）</span>
            <div className="admin-row admin-row--nums">
              <label>
                金币
                <input type="number" min={0} value={form.coins} onChange={(event) => patch({ coins: event.target.value })} />
              </label>
              <label>
                闪卡精华
                <input type="number" min={0} value={form.essence} onChange={(event) => patch({ essence: event.target.value })} />
              </label>
            </div>
          </div>
          <RowEditor
            label={`道具（单种最多 ${limits.itemCount}）`}
            rows={form.items}
            onChange={(items) => patch({ items })}
            options={ITEM_OPTIONS.map((item) => ({ id: item.id, name: item.name }))}
          />
          <RowEditor
            label={`卡包（单种最多 ${limits.packCount}）`}
            rows={form.packs}
            onChange={(packs) => patch({ packs })}
            options={PACK_OPTIONS}
          />
          <RowEditor
            label={`卡牌（合计最多 ${limits.cards} 张，填卡牌 id）`}
            rows={form.cards}
            onChange={(cards) => patch({ cards })}
            idPlaceholder="例如 hero-123456"
            foilToggle
          />

          <div>
            <button type="button" className="bk-btn bk-btn--main" onClick={() => void startPreview()}>
              预览并发送
            </button>
          </div>
        </fieldset>

        {error && (
          <p className="admin-msg is-error" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="admin-msg is-ok" role="status">
            {done}
          </p>
        )}

        {pending && (
          <div className="admin-confirm" role="alertdialog" aria-label="确认发送">
            <h3>确认发送</h3>
            <p>
              将发给 <strong>{pending.recipients}</strong> 名玩家（{audienceLabel(buildAudience(form))}）
              {pending.sample.length > 0 && (
                <span className="bk-note">（例如：{pending.sample.map((user) => user.username).join("、")}）</span>
              )}
            </p>
            <p>
              <strong>{form.title}</strong>
            </p>
            {lines.length > 0 ? <p>附件：{lines.join("，")}</p> : <p className="bk-note">没有附件。</p>}
            {needTyped && (
              <label className="admin-field">
                <span>这是群发邮件。请输入收件人数 {pending.recipients} 以确认：</span>
                <input value={typed} inputMode="numeric" onChange={(event) => setTyped(event.target.value)} />
              </label>
            )}
            <div className="admin-row">
              {/* 发出去和失败各有专属音效 */}
              <button
                type="button"
                className="bk-btn bk-btn--main"
                disabled={busy || (needTyped && typed.trim() !== String(pending.recipients))}
                onClick={() => void confirmSend()}
                data-sfx="none"
              >
                确认发送
              </button>
              <button type="button" className="bk-btn bk-btn--ghost" disabled={busy} onClick={() => setPending(null)}>
                返回修改
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="admin-card">
        <h2>发信记录</h2>
        {batches === null && <p className="bk-note">加载中…</p>}
        {batches?.length === 0 && <p className="bk-note admin-history__empty">还没有发过邮件。</p>}
        <ul className="admin-history">
          {batches?.map((batch) => (
            <li key={batch.id}>
              <div className="admin-history__top">
                <strong>{batch.title}</strong>
                <span className="bk-note">#{batch.id} · {formatTime(batch.createdAt)}</span>
              </div>
              <div className="bk-note">
                {audienceLabel(batch.audience)} · {batch.recipientCount} 人 · 发送者 {batch.adminId}
              </div>
              {batch.attachment && <div className="bk-note">附件：{attachmentLines(batch.attachment).join("，")}</div>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
