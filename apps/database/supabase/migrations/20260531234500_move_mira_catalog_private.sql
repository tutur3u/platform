-- Move Mira achievement and accessory catalogs off the public Data API surface.
--
-- The API routes remain the product boundary for reading these catalogs and for
-- joining them with user-owned unlock/equipment state.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.mira_accessories
  set schema private;

alter table if exists public.mira_achievements
  set schema private;

revoke all on table private.mira_accessories
from public, anon, authenticated;

revoke all on table private.mira_achievements
from public, anon, authenticated;

grant all on table private.mira_accessories to service_role;
grant all on table private.mira_achievements to service_role;

alter table private.mira_accessories enable row level security;
alter table private.mira_achievements enable row level security;

drop policy if exists "mira_accessories_select"
  on private.mira_accessories;

drop policy if exists "mira_achievements_select"
  on private.mira_achievements;

drop policy if exists "Service role can manage private Mira accessories"
  on private.mira_accessories;

drop policy if exists "Service role can manage private Mira achievements"
  on private.mira_achievements;

create policy "Service role can manage private Mira accessories"
  on private.mira_accessories
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage private Mira achievements"
  on private.mira_achievements
  for all
  to service_role
  using (true)
  with check (true);

comment on table private.mira_achievements is
  'Private Mira achievement catalog served through apps/web API routes.';

comment on table private.mira_accessories is
  'Private Mira accessory catalog served through apps/web API routes.';

notify pgrst, 'reload schema';
