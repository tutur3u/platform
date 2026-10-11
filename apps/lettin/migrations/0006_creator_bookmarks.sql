-- Actor-private creator references; no copied profiles, grants or social counts.
CREATE TABLE creator_bookmarks (
  user_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, creator_id)
);
CREATE INDEX creator_bookmarks_actor_order ON creator_bookmarks(user_id, created_at DESC, creator_id);
