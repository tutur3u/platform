-- Actor-private references only; no copied source content or public social counts.
CREATE TABLE reader_bookmarks (
  user_id TEXT NOT NULL,
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, world_id)
);
CREATE INDEX reader_bookmarks_actor_order ON reader_bookmarks(user_id, created_at DESC, world_id);
