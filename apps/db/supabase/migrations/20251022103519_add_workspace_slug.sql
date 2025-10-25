-- Add slug column to workspaces table
-- This migration adds a URL-friendly slug field for workspaces to enable human-readable URLs

-- Step 1: Add slug column (nullable initially to allow population)
alter table "public"."workspaces" add column "slug" text;

-- Step 2: Add check constraint to ensure slug is URL-friendly
-- Slugs must be lowercase alphanumeric with hyphens, 3-63 characters
alter table "public"."workspaces" add constraint "workspaces_slug_format_check"
  check (slug ~* '^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$');

-- Step 3: Create function to generate slug from name or handle
create or replace function generate_workspace_slug(workspace_id uuid)
returns text
language plpgsql
as $$
declare
  base_slug text;
  final_slug text;
  counter integer := 0;
begin
  -- Get base slug from handle if available, otherwise from name
  select coalesce(
    lower(regexp_replace(handle, '[^a-z0-9-]', '', 'gi')),
    lower(regexp_replace(regexp_replace(name, '[^a-z0-9\s-]', '', 'gi'), '\s+', '-', 'g')),
    'workspace'
  ) into base_slug
  from workspaces
  where id = workspace_id;

  -- Ensure slug is not empty and doesn't start/end with hyphen
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' or length(base_slug) < 3 then
    base_slug := 'workspace-' || substring(workspace_id::text, 1, 8);
  end if;

  -- Truncate to max 50 chars to leave room for counter
  base_slug := substring(base_slug, 1, 50);

  -- Find unique slug by appending counter if needed
  final_slug := base_slug;
  while exists (
    select 1 from workspaces
    where slug = final_slug
    and id != workspace_id
  ) loop
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  end loop;

  return final_slug;
end;
$$;

-- Step 4: Populate slug for existing workspaces
update "public"."workspaces"
set slug = generate_workspace_slug(id)
where slug is null;

-- Step 5: Make slug non-nullable
alter table "public"."workspaces" alter column "slug" set not null;

-- Step 6: Create unique index on slug
create unique index "workspaces_slug_key" on "public"."workspaces" using btree (slug);

-- Step 7: Add unique constraint using the index
alter table "public"."workspaces" add constraint "workspaces_slug_key" unique using index "workspaces_slug_key";

-- Step 8: Add trigger to auto-generate slug on insert if not provided
create or replace function set_workspace_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null then
    new.slug := generate_workspace_slug(new.id);
  end if;
  return new;
end;
$$;

create trigger "set_workspace_slug_trigger"
  before insert on "public"."workspaces"
  for each row
  execute function set_workspace_slug();

-- Step 9: Add comment for documentation
comment on column "public"."workspaces"."slug" is 'URL-friendly unique identifier for workspace. Used in routes like /workspace/{slug}';
