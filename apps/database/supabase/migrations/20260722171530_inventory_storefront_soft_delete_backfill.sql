-- A deploy can briefly run the application fallback before deleted_at reaches
-- PostgREST. Promote those metadata tombstones into the canonical marker once
-- the additive column exists, while retaining every checkout/audit reference.
update private.inventory_storefronts
set deleted_at = coalesce(updated_at, now())
where deleted_at is null
  and slug ~* '^deleted-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and metadata ? 'deletedAt'
  and metadata ? 'deletedSlug';
