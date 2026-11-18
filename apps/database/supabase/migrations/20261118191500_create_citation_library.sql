create function private.citation_library_tags_valid(p_tags text[])
returns boolean
language sql
immutable
strict
set search_path = pg_catalog, pg_temp
as $$
  select (cardinality(p_tags) = 0 or
          (array_ndims(p_tags) = 1 and array_lower(p_tags, 1) = 1))
    and cardinality(p_tags) <= 30
    and octet_length(array_to_string(p_tags, ',')) <= 3000
    and not exists (
      select 1 from unnest(p_tags) as tags(tag)
      where tag is null or tag !~ '[^[:space:]]'
        -- JavaScript counts supplementary Unicode characters as two code units.
        or char_length(tag) + char_length(regexp_replace(
          tag, '[^' || chr(65536) || '-' || chr(1114111) || ']', '', 'g'
        )) > 100
    );
$$;

create function private.citation_library_search_text(p_work jsonb, p_tags text[])
returns text
language sql
immutable
strict
set search_path = pg_catalog, pg_temp
as $$
  select concat_ws(' ', p_work ->> 'title', p_work ->> 'containerTitle',
    p_work ->> 'authors', p_work ->> 'doi', p_work ->> 'isbn',
    array_to_string(p_tags, ' '));
$$;

create table private.citation_library_items (
  id uuid primary key,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  work jsonb not null check (jsonb_typeof(work) = 'object'),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  tags text[] not null default '{}'
    check (private.citation_library_tags_valid(tags)),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint citation_library_items_work_size_check
    check (octet_length(work::text) <= 60000),
  constraint citation_library_items_workspace_fingerprint_key
    unique (ws_id, fingerprint)
);

create index citation_library_items_workspace_updated_idx
  on private.citation_library_items (ws_id, updated_at desc, id);
create index citation_library_items_owner_idx
  on private.citation_library_items (owner_user_id)
  where owner_user_id is not null;
create index citation_library_items_search_idx
  on private.citation_library_items using gin
  (private.citation_library_search_text(work, tags) gin_trgm_ops);

alter table private.citation_library_items enable row level security;
revoke all on private.citation_library_items
  from public, anon, authenticated, service_role;

-- The private schema denies direct client access. These policies also fence
-- authenticated callers if table access is granted.
create policy citation_library_item_read on private.citation_library_items
  for select to authenticated
  using (
    public.is_org_member((select auth.uid()), ws_id)
    and public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_documents')
  );

create policy citation_library_item_create on private.citation_library_items
  for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and public.is_org_member((select auth.uid()), ws_id)
    and public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_documents')
  );

create policy citation_library_item_edit on private.citation_library_items
  for update to authenticated
  using (
    public.is_org_member((select auth.uid()), ws_id)
    and public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_documents')
  )
  with check (
    public.is_org_member((select auth.uid()), ws_id)
    and public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_documents')
  );

create policy citation_library_item_remove on private.citation_library_items
  for delete to authenticated
  using (
    public.is_org_member((select auth.uid()), ws_id)
    and public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_documents')
  );

-- Service-only entry points receive the actor resolved from the user session
-- by the server. Recheck both conditions at the database boundary.
create function private.require_citation_library_access(p_ws_id uuid, p_actor_id uuid)
returns void
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role'
    or public.is_org_member(p_actor_id, p_ws_id) is not true
    or public.has_workspace_permission(p_ws_id, p_actor_id, 'manage_documents') is not true
  then
    raise insufficient_privilege using message = 'Citation library access denied';
  end if;
end;
$$;

create function private.list_citation_library_items(
  p_ws_id uuid,
  p_actor_id uuid,
  p_limit integer,
  p_offset integer,
  p_search text
)
returns setof private.citation_library_items
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_pattern text;
begin
  perform private.require_citation_library_access(p_ws_id, p_actor_id);
  if p_limit is null or p_limit not between 1 and 100
    or p_offset is null or p_offset not between 0 and 10000
    or p_search is null or char_length(p_search) > 200
  then
    raise invalid_parameter_value using message = 'Invalid citation library page';
  end if;

  v_pattern := '%' || replace(replace(replace(p_search, '!', '!!'), '%', '!%'), '_', '!_') || '%';
  return query
    select i.* from private.citation_library_items i
    where i.ws_id = p_ws_id and (
      p_search = '' or private.citation_library_search_text(i.work, i.tags)
        ilike v_pattern escape '!'
    )
    order by i.updated_at desc, i.id
    limit p_limit offset p_offset;
end;
$$;

create function private.lookup_citation_library_items(
  p_ws_id uuid,
  p_actor_id uuid,
  p_ids uuid[] default null,
  p_fingerprint text default null
)
returns setof private.citation_library_items
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform private.require_citation_library_access(p_ws_id, p_actor_id);
  if p_fingerprint is null and cardinality(p_ids) between 1 and 50 then
    return query select i.* from private.citation_library_items i
      where i.ws_id = p_ws_id and i.id = any(p_ids);
  elsif p_ids is null and p_fingerprint ~ '^[a-f0-9]{64}$' then
    return query select i.* from private.citation_library_items i
      where i.ws_id = p_ws_id and i.fingerprint = p_fingerprint;
  else
    raise invalid_parameter_value using message = 'Invalid citation library lookup';
  end if;
end;
$$;

create function private.insert_citation_library_item(
  p_ws_id uuid,
  p_actor_id uuid,
  p_id uuid,
  p_work jsonb,
  p_fingerprint text,
  p_tags text[]
)
returns setof private.citation_library_items
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform private.require_citation_library_access(p_ws_id, p_actor_id);
  return query
    insert into private.citation_library_items (id, ws_id, owner_user_id, work, fingerprint, tags)
    values (p_id, p_ws_id, p_actor_id, p_work, p_fingerprint, p_tags)
    returning *;
end;
$$;

create function private.update_citation_library_item(
  p_ws_id uuid,
  p_actor_id uuid,
  p_id uuid,
  p_expected_version integer,
  p_work jsonb,
  p_fingerprint text,
  p_tags text[]
)
returns setof private.citation_library_items
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform private.require_citation_library_access(p_ws_id, p_actor_id);
  return query
    update private.citation_library_items i
    set work = p_work,
        fingerprint = p_fingerprint,
        tags = p_tags,
        version = i.version + 1,
        updated_at = now()
    where i.ws_id = p_ws_id and i.id = p_id
      and i.version = p_expected_version and i.version < 2147483647
    returning i.*;
end;
$$;

create function private.delete_citation_library_item(
  p_ws_id uuid,
  p_actor_id uuid,
  p_id uuid,
  p_expected_version integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform private.require_citation_library_access(p_ws_id, p_actor_id);
  delete from private.citation_library_items i
  where i.ws_id = p_ws_id and i.id = p_id and i.version = p_expected_version;
  return found;
end;
$$;

revoke all on function
  private.citation_library_tags_valid(text[]),
  private.citation_library_search_text(jsonb, text[]),
  private.require_citation_library_access(uuid, uuid)
  from public, anon, authenticated, service_role;

revoke all on function
  private.list_citation_library_items(uuid, uuid, integer, integer, text),
  private.lookup_citation_library_items(uuid, uuid, uuid[], text),
  private.insert_citation_library_item(uuid, uuid, uuid, jsonb, text, text[]),
  private.update_citation_library_item(uuid, uuid, uuid, integer, jsonb, text, text[]),
  private.delete_citation_library_item(uuid, uuid, uuid, integer)
  from public, anon, authenticated, service_role;

grant execute on function
  private.list_citation_library_items(uuid, uuid, integer, integer, text),
  private.lookup_citation_library_items(uuid, uuid, uuid[], text),
  private.insert_citation_library_item(uuid, uuid, uuid, jsonb, text, text[]),
  private.update_citation_library_item(uuid, uuid, uuid, integer, jsonb, text, text[]),
  private.delete_citation_library_item(uuid, uuid, uuid, integer)
  to service_role;

notify pgrst, 'reload schema';
