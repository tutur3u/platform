CREATE INDEX entries_published_world ON entries(world_id) WHERE published IS NOT NULL;
CREATE INDEX worlds_published ON worlds(published_at DESC, id) WHERE published IS NOT NULL;
CREATE INDEX worlds_published_creator ON worlds(owner_id, published_at DESC, id) WHERE published IS NOT NULL;
