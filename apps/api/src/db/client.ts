import fs from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"

import * as schema from "./schema"

const dataDir = path.resolve(process.env.PG_DATA_DIR ?? "./.data/pg")
fs.mkdirSync(dataDir, { recursive: true })

export const client = await PGlite.create(dataDir)
export const db = drizzle(client, { schema })

const DDL = `
CREATE TABLE IF NOT EXISTS cards (
  id text PRIMARY KEY,
  osu_id bigint UNIQUE,
  name text NOT NULL,
  rarity text NOT NULL,
  job text NOT NULL,
  no integer NOT NULL,
  total integer NOT NULL,
  country text,
  global_rank integer,
  pp numeric,
  profile_url text,
  art text,
  banner text,
  skills jsonb NOT NULL,
  hero_bonus integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS cards_rarity_idx ON cards (rarity);
CREATE INDEX IF NOT EXISTS cards_name_idx ON cards (name);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS hero_bonus integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  username text NOT NULL,
  osu_id bigint UNIQUE,
  public_id integer,
  onboarded boolean NOT NULL DEFAULT false,
  hero_bonus integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS users_public_id_seq;
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id integer;
ALTER TABLE users ALTER COLUMN public_id SET DEFAULT nextval('users_public_id_seq');
UPDATE users SET public_id = nextval('users_public_id_seq') WHERE public_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_idx ON users (public_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hero_bonus integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS user_cards (
  id serial PRIMARY KEY,
  user_id text NOT NULL,
  card_id text NOT NULL,
  level integer NOT NULL DEFAULT 1,
  constellation integer NOT NULL DEFAULT 0,
  exp integer NOT NULL DEFAULT 0,
  mods jsonb NOT NULL DEFAULT '[]'::jsonb,
  obtained_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_cards ADD COLUMN IF NOT EXISTS exp integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS user_cards_user_idx ON user_cards (user_id);
CREATE INDEX IF NOT EXISTS user_cards_card_idx ON user_cards (card_id);

CREATE TABLE IF NOT EXISTS decks (
  user_id text PRIMARY KEY,
  name text NOT NULL DEFAULT '主卡组',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deck_slots (
  user_id text NOT NULL,
  slot integer NOT NULL,
  user_card_id integer NOT NULL,
  PRIMARY KEY (user_id, slot)
);

CREATE TABLE IF NOT EXISTS user_packs (
  user_id text NOT NULL,
  pool text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, pool)
);

CREATE TABLE IF NOT EXISTS pack_openings (
  id serial PRIMARY KEY,
  user_id text NOT NULL,
  pool text NOT NULL,
  count integer NOT NULL,
  seed text NOT NULL,
  results jsonb NOT NULL,
  pity_before integer NOT NULL,
  pity_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pack_openings_user_idx ON pack_openings (user_id);

CREATE TABLE IF NOT EXISTS pity (
  user_id text NOT NULL,
  pool text NOT NULL,
  counter integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, pool)
);
`

await client.exec(DDL)
