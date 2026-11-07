import { sql } from "drizzle-orm"
import {
  bigint,
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
    mods: jsonb("mods").notNull().default(sql`'[]'::jsonb`),
    obtainedAt: timestamp("obtained_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("user_cards_user_idx").on(table.userId),
    index("user_cards_card_idx").on(table.cardId),
  ],
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
