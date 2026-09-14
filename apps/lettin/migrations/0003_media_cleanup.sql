ALTER TABLE media ADD COLUMN deleting INTEGER NOT NULL DEFAULT 0 CHECK (deleting IN (0, 1));
CREATE INDEX media_cleanup ON media(world_id, created_at);
