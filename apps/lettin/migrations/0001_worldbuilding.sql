-- Workspace and user identities remain owned by Tuturuuu. Only Lettin data lives here.
PRAGMA foreign_keys = ON;
CREATE TABLE creators (
  user_id TEXT PRIMARY KEY,
  can_invite INTEGER NOT NULL DEFAULT 0 CHECK (can_invite IN (0, 1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  granted_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL CHECK (email = lower(trim(email)) AND length(email) <= 320),
  invited_by TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_by TEXT,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX invitations_owner ON invitations(invited_by, expires_at);
CREATE TABLE worlds (
  id TEXT PRIMARY KEY,
  ws_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  draft TEXT NOT NULL CHECK (json_valid(draft)),
  published TEXT CHECK (published IS NULL OR json_valid(published)),
  version INTEGER NOT NULL DEFAULT 1,
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (ws_id, id)
);
CREATE INDEX worlds_workspace ON worlds(ws_id, updated_at);
CREATE TABLE collaborators (
  ws_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('editor', 'publisher')),
  PRIMARY KEY (world_id, user_id),
  FOREIGN KEY (ws_id, world_id) REFERENCES worlds(ws_id, id) ON DELETE CASCADE
);
CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  ws_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  draft TEXT NOT NULL CHECK (json_valid(draft)),
  published TEXT CHECK (published IS NULL OR json_valid(published)),
  version INTEGER NOT NULL DEFAULT 1,
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (ws_id, world_id) REFERENCES worlds(ws_id, id) ON DELETE CASCADE
);
CREATE INDEX entries_world ON entries(ws_id, world_id, updated_at);
CREATE TABLE media (
  id TEXT PRIMARY KEY,
  ws_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  object_path TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (ws_id, world_id) REFERENCES worlds(ws_id, id) ON DELETE CASCADE
);
