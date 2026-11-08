import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

export const cards = pgTable(
  "cards",
  {
    id: text("id").primaryKey(),
    osuId: bigint("osu_id", { mode: "number" }).unique(),
    name: text("name").notNull(),
    rarity: text("rarity").notNull(),
    job: text("job").notNull(),
    no: integer("no").notNull(),
    total: integer("total").notNull(),
    country: text("country"),
    globalRank: integer("global_rank"),
    pp: numeric("pp"),
    profileUrl: text("profile_url"),
    art: text("art"),
    banner: text("banner"),
    skills: jsonb("skills").notNull(),
    /** 本体卡个人加成（basis point）；池卡为 0 */
    heroBonus: integer("hero_bonus").notNull().default(0),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("cards_rarity_idx").on(table.rarity),
    index("cards_name_idx").on(table.name),
  ],
)

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  osuId: bigint("osu_id", { mode: "number" }).unique(),
  /** 是否完成新手引导；引导完成后才激活本体卡个人加成 */
  onboarded: boolean("onboarded").notNull().default(false),
  /** 由 /me/osu 算出的个人加成（basis point），0–2000 */
  heroBonus: integer("hero_bonus").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

export const userCards = pgTable(
  "user_cards",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    cardId: text("card_id").notNull(),
    level: integer("level").notNull().default(1),
    constellation: integer("constellation").notNull().default(0),
    /** 当前等级内累计的经验；升级时扣除 */
    exp: integer("exp").notNull().default(0),
    mods: jsonb("mods").notNull().default(sql`'[]'::jsonb`),
    obtainedAt: timestamp("obtained_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("user_cards_user_idx").on(table.userId),
    index("user_cards_card_idx").on(table.cardId),
  ],
)

export const decks = pgTable("decks", {
  userId: text("user_id").primaryKey(),
  name: text("name").notNull().default("主卡组"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

export const deckSlots = pgTable(
  "deck_slots",
  {
    userId: text("user_id").notNull(),
    /** 主队槽位 1–7 */
    slot: integer("slot").notNull(),
    userCardId: integer("user_card_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.slot] })],
)

export const packOpenings = pgTable(
  "pack_openings",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    pool: text("pool").notNull(),
    count: integer("count").notNull(),
    seed: text("seed").notNull(),
    results: jsonb("results").notNull(),
    pityBefore: integer("pity_before").notNull(),
    pityAfter: integer("pity_after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("pack_openings_user_idx").on(table.userId)],
)

export const pity = pgTable(
  "pity",
  {
    userId: text("user_id").notNull(),
    pool: text("pool").notNull(),
    counter: integer("counter").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.pool] })],
)
