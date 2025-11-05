-- Migrate selected FK columns from public.workspace_users → public.users
-- Columns affected:
--   - public.product_stock_changes.creator_id (NOT NULL)
--   - public.user_feedbacks.creator_id
--   - public.finance_invoices.creator_id
--   - public.workspace_users.created_by
--   - public.workspace_users.updated_by
-- Strategy:
--   1) Backfill current values using mapping table public.workspace_user_linked_users
--      mapping: virtual_user_id (workspace_users.id) → platform_user_id (public.users.id)
--   2) Drop existing FKs to workspace_users
--   3) Create new FKs to public.users(id) with original ON DELETE semantics
--   4) Update dependent view to reference public.users where needed

set check_function_bodies = off;

begin;

-- 1) Backfill data to platform user ids using the link table

-- product_stock_changes.creator_id (was workspace_users.id → becomes users.id)
update public.product_stock_changes p
set creator_id = wulu.platform_user_id
from public.workspace_user_linked_users wulu
where wulu.virtual_user_id = p.creator_id;

-- user_feedbacks.creator_id
update public.user_feedbacks uf
set creator_id = wulu.platform_user_id
from public.workspace_user_linked_users wulu
where uf.creator_id is not null
  and wulu.virtual_user_id = uf.creator_id;

-- finance_invoices.creator_id
update public.finance_invoices fi
set creator_id = wulu.platform_user_id
from public.workspace_user_linked_users wulu
where fi.creator_id is not null
  and wulu.virtual_user_id = fi.creator_id;

-- workspace_users.created_by
update public.workspace_users wu
set created_by = wulu.platform_user_id
from public.workspace_user_linked_users wulu
where wu.created_by is not null
  and wulu.virtual_user_id = wu.created_by
  and wulu.ws_id = wu.ws_id;

-- workspace_users.updated_by
update public.workspace_users wu
set updated_by = wulu.platform_user_id
from public.workspace_user_linked_users wulu
where wu.updated_by is not null
  and wulu.virtual_user_id = wu.updated_by
  and wulu.ws_id = wu.ws_id;


-- 2) Drop existing foreign keys referencing workspace_users

alter table if exists public.product_stock_changes
  drop constraint if exists product_stock_changes_creator_id_fkey;

alter table if exists public.user_feedbacks
  drop constraint if exists user_feedbacks_creator_id_fkey;

alter table if exists public.finance_invoices
  drop constraint if exists finance_invoices_creator_id_fkey,
  drop constraint if exists public_finance_invoices_creator_id_fkey; -- seen in earlier migrations

alter table if exists public.workspace_users
  drop constraint if exists workspace_users_created_by_fkey,
  drop constraint if exists public_workspace_users_updated_by_fkey;


-- 3) Add new foreign keys to public.users(id)

-- Keep original ON UPDATE/DELETE semantics where present in history

alter table public.product_stock_changes
  add constraint product_stock_changes_creator_id_fkey
  foreign key (creator_id) references public.users(id)
  on update cascade on delete cascade not valid;
alter table public.product_stock_changes
  validate constraint product_stock_changes_creator_id_fkey;

alter table public.user_feedbacks
  add constraint user_feedbacks_creator_id_fkey
  foreign key (creator_id) references public.users(id)
  on update cascade on delete cascade not valid;
alter table public.user_feedbacks
  validate constraint user_feedbacks_creator_id_fkey;

alter table public.finance_invoices
  add constraint finance_invoices_creator_id_fkey
  foreign key (creator_id) references public.users(id)
  on update cascade on delete set default not valid;
alter table public.finance_invoices
  validate constraint finance_invoices_creator_id_fkey;

alter table public.workspace_users
  add constraint workspace_users_created_by_fkey
  foreign key (created_by) references public.users(id)
  on update cascade on delete set default not valid;
alter table public.workspace_users
  validate constraint workspace_users_created_by_fkey;

alter table public.workspace_users
  add constraint public_workspace_users_updated_by_fkey
  foreign key (updated_by) references public.users(id)
  on update cascade on delete set default not valid;
alter table public.workspace_users
  validate constraint public_workspace_users_updated_by_fkey;


-- 4) Update dependent view(s) to reflect creator_id now referencing public.users
-- distinct_invoice_creators previously joined workspace_users; switch to public.users

drop view if exists public.distinct_invoice_creators;

create or replace view public.distinct_invoice_creators as
select distinct u.id,
       coalesce(u.display_name, u.handle) as display_name
from public.finance_invoices b,
     public.users u
where u.id = b.creator_id;

commit;

-- Compatibility triggers: map workspace_user IDs to platform user IDs on write
-- This guards against application code still sending workspace_users.id values.

begin;

create or replace function public._map_creator_id_to_platform_user()
returns trigger
language plpgsql
as $$
declare
  exists_in_users boolean;
  mapped_platform_id uuid;
begin
  if NEW.creator_id is null then
    return NEW;
  end if;

  -- Fast path: if it's already a valid public.users id, keep it
  select exists(select 1 from public.users u where u.id = NEW.creator_id) into exists_in_users;
  if exists_in_users then
    return NEW;
  end if;

  -- Try mapping from workspace_users via link table
  select wulu.platform_user_id
    into mapped_platform_id
  from public.workspace_user_linked_users wulu
  where wulu.virtual_user_id = NEW.creator_id
  limit 1;

  if mapped_platform_id is not null then
    NEW.creator_id = mapped_platform_id;
    return NEW;
  end if;

  -- As a last resort, leave value unchanged; FK will enforce integrity
  return NEW;
end;
$$;

-- Attach to affected tables
drop trigger if exists trg_map_creator_id_product_stock_changes on public.product_stock_changes;
create trigger trg_map_creator_id_product_stock_changes
before insert or update of creator_id on public.product_stock_changes
for each row execute function public._map_creator_id_to_platform_user();

drop trigger if exists trg_map_creator_id_user_feedbacks on public.user_feedbacks;
create trigger trg_map_creator_id_user_feedbacks
before insert or update of creator_id on public.user_feedbacks
for each row execute function public._map_creator_id_to_platform_user();

drop trigger if exists trg_map_creator_id_finance_invoices on public.finance_invoices;
create trigger trg_map_creator_id_finance_invoices
before insert or update of creator_id on public.finance_invoices
for each row execute function public._map_creator_id_to_platform_user();

commit;


