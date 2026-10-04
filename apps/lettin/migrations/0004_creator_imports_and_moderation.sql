CREATE TABLE import_previews (
  id TEXT PRIMARY KEY,
  ws_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  world_id TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL CHECK(json_valid(plan)),
  applied INTEGER NOT NULL DEFAULT 0 CHECK(applied IN (0,1)),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX import_previews_actor ON import_previews(ws_id,actor_id,expires_at);
CREATE TABLE creator_blacklist (
  id TEXT PRIMARY KEY,
  ws_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 160),
  reason TEXT NOT NULL DEFAULT '' CHECK(length(reason)<=4000),
  reference_url TEXT NOT NULL DEFAULT '' CHECK(length(reference_url)<=2000),
  source_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX creator_blacklist_owner ON creator_blacklist(ws_id,owner_id,created_at);
CREATE UNIQUE INDEX creator_blacklist_import_source ON creator_blacklist(ws_id,owner_id,source_id) WHERE source_id IS NOT NULL;

-- Tulletin-specific public creative details; canonical identity stays in Tuturuuu users.
CREATE TABLE creator_profiles (
  user_id TEXT PRIMARY KEY,
  details TEXT NOT NULL CHECK(json_valid(details)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
