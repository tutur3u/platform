-- tuturuuu: no-grant (internal)
begin;
set local createrole_self_grant = '';
create role memory_rpc nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role memory_rpc_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant memory_rpc to authenticator with inherit false, set true;
grant memory_rpc_owner to postgres with inherit false, set true;
alter role memory_rpc set statement_timeout = '1s';
create schema memory_storage;
create schema memory_api;
revoke all on schema memory_storage, memory_api, memory_gateway from public, anon, authenticated, service_role;
-- The existing postgres routine defaults are verified without changing other schemas.
set local role memory_rpc_owner;
alter default privileges revoke execute on functions from public;
reset role;
alter default privileges in schema memory_storage, memory_api, memory_gateway
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema memory_storage, memory_api, memory_gateway
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges in schema memory_storage, memory_api, memory_gateway
  revoke all on functions from public, anon, authenticated, service_role;
select memory_gateway.assert_default_acl();
grant usage on schema memory_api, memory_gateway to memory_rpc;
grant usage on schema extensions to memory_rpc_owner;
grant create, usage on schema memory_storage, memory_api to memory_rpc_owner;
-- allow-anon-grant: Preserve the ordinary account hook's effective schema lookup.
grant usage on schema memory_gateway to anon, authenticated, service_role;
create table memory_storage.gateway_baseline (
  singleton boolean primary key default true check (singleton),
  prior_acl aclitem[] not null,
  prior_hook text not null
);
insert into memory_storage.gateway_baseline (prior_acl, prior_hook)
select coalesce(nspacl, acldefault('n', nspowner)), 'public.check_account_request'
from pg_namespace where nspname = 'public';
create temporary table memory_public_role_baseline on commit drop as
select memory_gateway.public_role_access() as roles;
create table memory_storage.principals (
  subject uuid primary key references auth.users (id) on delete cascade,
  caller text unique not null check (caller in ('assistant', 'people-registry'))
);
create table memory_storage.admission (
  caller text primary key check (caller in ('assistant', 'people-registry')),
  stopped boolean not null default true,
  epoch bigint not null default 0,
  remaining integer not null default 0 check (remaining between 0 and 100000),
  revision bigint not null default 0,
  request_id uuid,
  ticket uuid,
  fence bigint,
  operation text,
  tags text[],
  expires_at timestamptz,
  instance_started_at timestamptz
);
insert into memory_storage.admission (caller) values ('assistant'), ('people-registry');
create sequence memory_storage.assistant_fence cache 1 no cycle;
create sequence memory_storage.people_fence cache 1 no cycle;
create table memory_storage.reservation_ids (
  caller text not null references memory_storage.admission (caller),
  request_id uuid not null,
  primary key (caller, request_id)
);
create table memory_storage.memories (
  id uuid primary key default gen_random_uuid(),
  caller text not null references memory_storage.admission (caller),
  tag text not null,
  custom_id text not null,
  content text not null check (octet_length(content) <= 80000),
  metadata jsonb not null,
  embedding extensions.halfvec(3072) not null,
  title text,
  status text not null default 'done' check (status in ('done', 'forgotten')),
  forget_reason text,
  forgotten_at timestamptz,
  updated_at timestamptz not null default now(),
  revision bigint not null,
  fts tsvector generated always as (
    setweight(to_tsvector('english', content), 'A')
    || setweight(to_tsvector('english', metadata::text), 'B')
  ) stored,
  unique (caller, custom_id)
);
create index memory_vector on memory_storage.memories using hnsw (embedding extensions.halfvec_cosine_ops);
create index memory_fts on memory_storage.memories using gin (fts);
create index memory_tag_time on memory_storage.memories (caller, tag, status, updated_at, id);
create index memory_tag_custom on memory_storage.memories (caller, tag, custom_id);
create table memory_storage.retired_ids (
  caller text not null references memory_storage.admission (caller),
  custom_id text not null,
  primary key (caller, custom_id)
);
create table memory_storage.retired_tags (
  caller text not null references memory_storage.admission (caller),
  tag text not null,
  primary key (caller, tag)
);
create table memory_storage.purge_receipts (
  caller text not null references memory_storage.admission (caller),
  request_id uuid not null,
  request_digest text not null,
  receipt jsonb not null,
  created_at timestamptz not null default now(),
  primary key (caller, request_id)
);
revoke all on all tables in schema memory_storage from public, anon, authenticated, service_role;
revoke all on all sequences in schema memory_storage from public, anon, authenticated, service_role;
grant select on memory_storage.principals to memory_rpc_owner;
grant select, insert on memory_storage.reservation_ids to memory_rpc_owner;
grant select, insert, delete on memory_storage.memories to memory_rpc_owner;
grant update (content, embedding, status, forget_reason, forgotten_at, updated_at, revision)
  on memory_storage.memories to memory_rpc_owner;
grant select, insert on memory_storage.retired_ids, memory_storage.retired_tags,
  memory_storage.purge_receipts to memory_rpc_owner;
grant select, update (
  remaining, revision, request_id, ticket, fence, operation, tags, expires_at, instance_started_at
) on memory_storage.admission to memory_rpc_owner;
grant usage, select on sequence memory_storage.assistant_fence, memory_storage.people_fence to memory_rpc_owner;
create function memory_storage.bump_epoch() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if old.stopped is distinct from new.stopped then
    new.epoch := old.epoch + 1;
    new.ticket := null;
  end if;
  return new;
end
$$;
revoke all on function memory_storage.bump_epoch() from public, anon, authenticated, service_role;
create trigger memory_epoch before update of stopped on memory_storage.admission
  for each row execute function memory_storage.bump_epoch();
create function memory_gateway.check_request() returns void
language plpgsql as $$
begin
  if current_user = 'memory_rpc' then
    -- PostgREST puts the negotiated schema first in this invoker's transaction search path.
    if pg_catalog.current_schema() is distinct from 'memory_api'
      or pg_catalog.current_setting('request.method', true) is distinct from 'POST'
      or coalesce(pg_catalog.current_setting('request.path', true), '') not in ('/rpc/reserve', '/rpc/execute')
      or pg_catalog.current_setting('request.jwt.claims', true)::pg_catalog.jsonb operator(pg_catalog.->>) 'role' is distinct from 'memory_rpc' then
      raise insufficient_privilege using message = 'memory route denied';
    end if;
    return;
  end if;
  perform public.check_account_request();
end
$$;
revoke all on function memory_gateway.check_request() from public, anon, authenticated, service_role;
-- allow-anon-grant: Keep anonymous requests on the existing account hook.
grant execute on function memory_gateway.check_request()
  -- tuturuuu: reviewed(function-grant): memory_gateway.check_request() anon-required review=apps/database/supabase/tests/memory-postgrest-effective-acl.sql
  to anon, authenticated, service_role, memory_rpc;
-- tuturuuu: reviewed(dynamic-sql-review): apps/database/supabase/tests/memory-postgrest-boundary.sql
do $$
begin
  if not exists (
    select 1 from pg_roles where rolname = 'authenticator'
      and 'pgrst.db_pre_request=public.check_account_request' = any(rolconfig)
  ) or exists (
    select from pg_db_role_setting s, unnest(s.setconfig) as setting
    where s.setdatabase = (select oid from pg_database where datname = current_database())
      and s.setrole in (0, 'authenticator'::regrole) and setting like 'pgrst.db_pre_request=%'
  ) then
    raise exception 'Unexpected PostgREST account pre-request hook';
  end if;
end
$$;
alter role authenticator set pgrst.db_pre_request = 'memory_gateway.check_request';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
create function memory_gateway.access_token(event jsonb) returns jsonb
language plpgsql stable set search_path = pg_catalog, pg_temp as $$
declare
  claims jsonb := event -> 'claims';
  actor text;
begin
  select caller into actor from memory_storage.principals
  where subject = (event ->> 'user_id')::uuid;
  if actor is null then
    return jsonb_build_object('claims', claims);
  end if;
  if claims ->> 'role' is distinct from 'memory_rpc'
    or claims ->> 'sub' is distinct from event ->> 'user_id' then
    raise insufficient_privilege using message = 'invalid memory identity';
  end if;
  return jsonb_build_object('claims', claims || jsonb_build_object(
    'memory_caller', actor,
    'exp', least((claims ->> 'exp')::bigint, floor(extract(epoch from now()))::bigint + 60)
  ));
end
$$;
revoke all on function memory_gateway.access_token(jsonb) from public, anon, authenticated, service_role;
grant usage on schema memory_gateway, memory_storage to supabase_auth_admin;
grant select on memory_storage.principals to supabase_auth_admin;
grant execute on function memory_gateway.access_token(jsonb) to supabase_auth_admin;
create function memory_storage.caller() returns text
language plpgsql stable set search_path = pg_catalog, pg_temp as $$
declare
  claims jsonb;
  actor text;
begin
  if session_user <> 'authenticator' then
    raise insufficient_privilege using message = 'memory gateway connection required';
  end if;
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  if claims ->> 'role' is distinct from 'memory_rpc'
    or coalesce((claims ->> 'exp')::bigint, 0) <= extract(epoch from clock_timestamp()) then
    raise insufficient_privilege using message = 'memory token required';
  end if;
  select caller into actor from memory_storage.principals
    where subject = (claims ->> 'sub')::uuid;
  if actor is null or claims ->> 'memory_caller' is distinct from actor
    or (claims ->> 'exp')::bigint > extract(epoch from now()) + 60 then
    raise insufficient_privilege using message = 'memory subject denied';
  end if;
  return actor;
end
$$;
create function memory_storage.check_scope(actor text, tag text, custom_id text default null) returns void
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  id_pattern constant text := '[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}';
begin
  if octet_length(tag) > 160 or custom_id is not null and custom_id !~ '^[a-zA-Z0-9._-]{1,200}$' then
    raise invalid_parameter_value;
  end if;
  if actor = 'assistant' and tag ~ '^tuturuuu\.user\.[a-zA-Z0-9._-]+\.workspace\.[a-zA-Z0-9._-]+$' then
    return;
  end if;
  if actor = 'people-registry'
    and tag ~ ('^tuturuuu\.people\.' || id_pattern || '\.(person|conversation)\.' || id_pattern || '$')
    and (custom_id is null or custom_id ~ ('^people\.' || split_part(tag, '.', 3) || '\.' || id_pattern || '$')) then
    return;
  end if;
  raise insufficient_privilege using message = 'memory tag denied';
end
$$;
create function memory_storage.last_fence(actor text) returns bigint
language sql volatile set search_path = pg_catalog, pg_temp
return case actor when 'assistant' then (select last_value from memory_storage.assistant_fence)
  else (select last_value from memory_storage.people_fence) end;
create function memory_storage.advance_fence(actor text) returns bigint
language sql volatile set search_path = pg_catalog, pg_temp
return nextval(case actor when 'assistant' then 'memory_storage.assistant_fence'::regclass
  else 'memory_storage.people_fence'::regclass end);
create function memory_storage.check_tags(actor text, op text, tags text[]) returns void
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  tag text;
begin
  if tags is null or cardinality(tags) not between 1 and 20
    or op <> 'list' and cardinality(tags) <> 1 then
    raise invalid_parameter_value;
  end if;
  foreach tag in array tags loop
    perform memory_storage.check_scope(actor, tag);
    if actor = 'people-registry' and split_part(tag, '.', 3) <> split_part(tags[1], '.', 3) then
      raise insufficient_privilege using message = 'memory workspace denied';
    end if;
  end loop;
end
$$;
create function memory_storage.consume(wanted_ticket uuid, wanted_op text, wanted_tags text[]) returns memory_storage.admission
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  actor text := memory_storage.caller();
  gate memory_storage.admission%rowtype;
begin
  select * into strict gate from memory_storage.admission where caller = actor for update;
  if gate.stopped then
    raise insufficient_privilege using message = 'memory_stopped';
  end if;
  if gate.ticket is null or gate.ticket is distinct from wanted_ticket
    or gate.operation is distinct from wanted_op or gate.tags is distinct from wanted_tags
    or gate.expires_at is null or gate.expires_at <= clock_timestamp()
    or gate.instance_started_at is distinct from pg_postmaster_start_time()
    or gate.fence is distinct from memory_storage.last_fence(actor) then
    raise insufficient_privilege using message = 'memory reservation denied';
  end if;
  -- CACHE 1 keeps the fence shared across backend transactions. A failed
  -- data transaction cannot roll back its consumption.
  perform memory_storage.advance_fence(actor);
  return gate;
end
$$;
create function memory_api.reserve(request_id uuid, operation text, tags text[]) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  actor text := memory_storage.caller();
  gate memory_storage.admission%rowtype;
  reserved uuid := gen_random_uuid();
  pending boolean;
begin
  if request_id is null or operation is null or operation not in (
    'add', 'read', 'read_by_custom_id', 'update', 'forget', 'purge', 'search', 'list'
  ) then
    raise invalid_parameter_value;
  end if;
  perform memory_storage.check_tags(actor, operation, tags);
  select * into strict gate from memory_storage.admission where caller = actor for update;
  if gate.stopped then
    raise insufficient_privilege using message = 'memory_stopped';
  end if;
  pending := gate.ticket is not null and gate.fence = memory_storage.last_fence(actor)
    and gate.expires_at > clock_timestamp() and gate.instance_started_at = pg_postmaster_start_time();
  if gate.request_id = reserve.request_id then
    if pending and gate.tags = reserve.tags and gate.operation = reserve.operation then
      return gate.ticket;
    end if;
    raise insufficient_privilege using message = 'memory reservation denied';
  end if;
  if exists (select 1 from memory_storage.reservation_ids r
    where r.caller = actor and r.request_id = reserve.request_id) then
    raise insufficient_privilege using message = 'memory reservation denied';
  end if;
  if pending then
    raise lock_not_available using message = 'memory_busy';
  end if;
  if gate.remaining <= 0 then
    raise insufficient_privilege using message = 'memory_stopped';
  end if;
  insert into memory_storage.reservation_ids values (actor, reserve.request_id);
  update memory_storage.admission
  set remaining = remaining - 1, request_id = reserve.request_id, operation = reserve.operation,
    tags = reserve.tags, ticket = reserved, fence = memory_storage.advance_fence(actor),
    expires_at = clock_timestamp() + interval '20 seconds', instance_started_at = pg_postmaster_start_time()
  where caller = actor;
  return reserved;
end
$$;
revoke all on function memory_api.reserve(uuid, text, text[]) from public, anon, authenticated, service_role;
-- tuturuuu: reviewed(alter-routine-review): apps/database/supabase/tests/memory-postgrest-boundary.sql
alter function memory_api.reserve(uuid, text, text[]) owner to memory_rpc_owner;
create function memory_storage.reply(payload jsonb, http_status integer default 200) returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp
return jsonb_build_object('status', http_status, 'body', payload);
create function memory_storage.next_revision(actor text) returns text
language sql volatile set search_path = pg_catalog, pg_temp
begin atomic
  update memory_storage.admission set revision = revision + 1 where caller = actor returning revision::text;
end;
create function memory_storage.view_row(row_data memory_storage.memories) returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp
return jsonb_build_object('id', row_data.id, 'content', row_data.content,
  'metadata', row_data.metadata, 'status', row_data.status,
  'customId', row_data.custom_id, 'revision', row_data.revision::text);
create function memory_storage.embedding(input jsonb) returns extensions.halfvec
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  result extensions.halfvec(3072);
begin
  if input is null or jsonb_typeof(input) <> 'array' or jsonb_array_length(input) <> 3072 then
    raise invalid_parameter_value;
  end if;
  result := (input::text)::extensions.halfvec(3072);
  if extensions.l2_norm(result) = 0 then raise invalid_parameter_value; end if;
  return result;
end
$$;

create function memory_storage.has_replacement(actor text, tag_value text, replacement jsonb, except_id uuid) returns boolean
language sql stable set search_path = pg_catalog, pg_temp
return exists (
  select 1 from memory_storage.memories m where m.caller = actor and m.tag = tag_value
    and m.custom_id = replacement ->> 'customId' and m.revision::text = replacement ->> 'revision'
    and m.status = 'done' and m.id is distinct from except_id
);

create function memory_storage.purge(actor text, tag_value text, snapshot bigint, input jsonb) returns jsonb
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  request_key uuid := (input ->> 'requestId')::uuid;
  prefix text := input ->> 'customIdPrefix';
  replacement jsonb := input -> 'replacement';
  ids text[];
  selected text[];
  unavailable text[];
  eligible text[];
  receipt_value jsonb;
  digest_value text;
  existing memory_storage.purge_receipts%rowtype;
  full_tag boolean;
  custom_id_value text;
begin
  select coalesce(array_agg(distinct value order by value), '{}'::text[]) into ids
    from jsonb_array_elements_text(coalesce(input -> 'customIds', '[]'::jsonb));
  if request_key is null or cardinality(ids) > 50 or prefix is not null and (
      actor <> 'assistant' or cardinality(ids) <> 0 or prefix !~ '^[a-zA-Z0-9._-]{1,200}$'
    ) then raise invalid_parameter_value; end if;
  foreach custom_id_value in array ids loop
    if custom_id_value is null then raise invalid_parameter_value; end if;
    perform memory_storage.check_scope(actor, tag_value, custom_id_value);
  end loop;
  digest_value := encode(sha256(convert_to(jsonb_build_array(
    tag_value, ids, prefix, input ->> 'expectedRevision', replacement
  )::text, 'UTF8')), 'hex');
  select * into existing from memory_storage.purge_receipts
    where caller = actor and request_id = request_key;
  if found then
    if existing.request_digest = digest_value then return memory_storage.reply(existing.receipt); end if;
    return memory_storage.reply('{"error":"request_id_conflict"}', 409);
  end if;
  if snapshot::text is distinct from input ->> 'expectedRevision' then
    return memory_storage.reply('{"error":"revision_conflict"}', 409);
  end if;

  full_tag := prefix is null and cardinality(ids) = 0;
  if replacement is not null and (full_tag or replacement ->> 'customId' = any(ids)
    or coalesce(starts_with(replacement ->> 'customId', prefix), false)
    or not memory_storage.has_replacement(actor, tag_value, replacement, null)) then
    return memory_storage.reply('{"error":"replacement_unconfirmed"}', 409);
  end if;

  if cardinality(ids) > 0 then
    select coalesce(array_agg(m.custom_id order by m.custom_id), '{}'::text[]) into unavailable
      from memory_storage.memories m where m.caller = actor and m.tag <> tag_value and m.custom_id = any(ids);
    select coalesce(array_agg(i order by i), '{}'::text[]) into selected
      from unnest(ids) i where not i = any(unavailable);
  else
    unavailable := '{}';
    select array(select m.custom_id from memory_storage.memories m
      where m.caller = actor and m.tag = tag_value and (prefix is null or starts_with(m.custom_id, prefix))
      order by m.custom_id limit 51) into selected;
  end if;
  eligible := selected[1:50];

  if full_tag then
    insert into memory_storage.retired_tags values (actor, tag_value) on conflict do nothing;
  end if;
  insert into memory_storage.retired_ids select actor, id from unnest(eligible) id on conflict do nothing;
  delete from memory_storage.memories m where m.caller = actor and m.tag = tag_value and m.custom_id = any(eligible);
  receipt_value := jsonb_build_object('purged', eligible,
    'retained', coalesce((select jsonb_agg(jsonb_build_object('customId', id, 'reason', 'unavailable'))
      from unnest(unavailable) id), '[]'::jsonb),
    'revision', memory_storage.next_revision(actor),
    'complete', cardinality(selected) <= 50 and cardinality(unavailable) = 0);
  insert into memory_storage.purge_receipts (caller, request_id, request_digest, receipt)
    values (actor, request_key, digest_value, receipt_value);
  return memory_storage.reply(receipt_value);
end
$$;

create function memory_storage.search(actor text, tag_value text, input jsonb, max_rows integer) returns jsonb
language sql stable set search_path = pg_catalog, pg_temp
begin atomic
  with params as (
    select memory_storage.embedding(input -> 'embedding') as vector,
      websearch_to_tsquery('english', coalesce(input ->> 'q', '')) as keywords
  ), vectors as (
    select m.id, m.embedding operator(extensions.<=>) p.vector as distance
    from memory_storage.memories m cross join params p
    where m.caller = actor and m.tag = tag_value and m.status = 'done'
    order by distance limit max_rows
  ), words as (
    select m.id, ts_rank_cd(m.fts, p.keywords) as score
    from memory_storage.memories m cross join params p
    where m.caller = actor and m.tag = tag_value and m.status = 'done' and m.fts @@ p.keywords
    order by score desc, m.id limit max_rows
  ), vector_rank as (
    select id, row_number() over (order by distance, id) as rank from vectors
  ), word_rank as (
    select id, row_number() over (order by score desc, id) as rank from words
  ), ranked as (
    select coalesce(v.id, w.id) as id, coalesce(1.0 / (60 + v.rank), 0) + coalesce(1.0 / (60 + w.rank), 0) as score
    from vector_rank v full join word_rank w using (id)
  ), bounded as (
    select m.id, m.content as chunk, m.content as memory, m.metadata, m.revision::text as revision,
      m.updated_at as "updatedAt", r.score as similarity
    from ranked r join memory_storage.memories m on m.id = r.id
    order by r.score desc, m.updated_at desc, m.id limit max_rows
  )
  select coalesce(jsonb_agg(to_jsonb(b) order by similarity desc, "updatedAt" desc, id), '[]'::jsonb) from bounded b;
end;

create function memory_api.execute(ticket uuid, operation text, tags text[], input jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  gate memory_storage.admission%rowtype;
  target memory_storage.memories%rowtype;
  tag_value text := tags[1];
  custom_id_value text := input ->> 'customId';
  target_id uuid;
  content_value text := input ->> 'content';
  payload jsonb;
  requested_limit integer;
  conflict constant jsonb := '{"error":"revision_conflict"}';
  missing constant jsonb := '{"error":"not_found"}';
begin
  if input is null or jsonb_typeof(input) <> 'object' or octet_length(input::text) > 262144 then
    raise invalid_parameter_value;
  end if;
  gate := memory_storage.consume(ticket, operation, tags);
  if operation = 'purge' then
    return memory_storage.purge(gate.caller, tag_value, gate.revision, input);
  end if;

  if operation in ('list', 'search') then
    requested_limit := (input ->> 'limit')::integer;
    if requested_limit is null or requested_limit not between 1 and 500 or length(input ->> 'q') > 4000 then
      raise invalid_parameter_value;
    end if;
    if operation = 'search' then
      if exists (select 1 from memory_storage.retired_tags where caller = gate.caller and tag = tag_value) then
        return memory_storage.reply('{"results":[]}');
      end if;
      return memory_storage.reply(jsonb_build_object('results',
        memory_storage.search(gate.caller, tag_value, input, least(requested_limit * 4, 500))));
    end if;
    select coalesce(jsonb_agg(row_value), '[]'::jsonb) into payload from (
      select jsonb_build_object(
        'id', m.id, 'content', case when (input ->> 'includeContent')::boolean then m.content end,
        'metadata', m.metadata, 'status', m.status, 'summary', null, 'title', m.title,
        'customId', m.custom_id, 'revision', m.revision::text, 'updatedAt', m.updated_at
      ) as row_value
      from memory_storage.memories m where m.caller = gate.caller and m.tag = any(tags)
        and m.status = 'done'
        and not exists (select 1 from memory_storage.retired_tags r where r.caller = m.caller and r.tag = m.tag)
      order by case when input ->> 'order' = 'asc' then m.updated_at end asc,
        case when input ->> 'order' = 'desc' then m.updated_at end desc, m.id
      limit least(requested_limit * 3, 1000)
    ) bounded;
    return memory_storage.reply(jsonb_build_object('memories', payload, 'revision', gate.revision::text));
  end if;

  if operation in ('add', 'read_by_custom_id') and custom_id_value is null then raise invalid_parameter_value; end if;
  perform memory_storage.check_scope(gate.caller, tag_value, custom_id_value);
  if operation in ('add', 'update') and (content_value is null or char_length(btrim(content_value)) not between 1 and 20000) then
    raise invalid_parameter_value;
  end if;
  if exists (select 1 from memory_storage.retired_tags where caller = gate.caller and tag = tag_value) then
    case operation
      when 'add' then return memory_storage.reply('{"error":"memory_retired"}', 409);
      when 'update' then return memory_storage.reply(conflict, 409);
      when 'forget' then return memory_storage.reply(jsonb_build_object('forgotten', false, 'id', input ->> 'id'));
      else return memory_storage.reply(missing, 404);
    end case;
  end if;

  if operation = 'add' then
    if exists (select 1 from memory_storage.retired_ids where caller = gate.caller and custom_id = custom_id_value) then
      return memory_storage.reply('{"error":"memory_retired"}', 409);
    end if;
    select * into target from memory_storage.memories where caller = gate.caller and custom_id = custom_id_value;
    if found and target.tag <> tag_value then return memory_storage.reply('{"error":"custom_id_conflict"}', 409); end if;
    if not found then
      if coalesce(jsonb_typeof(input -> 'metadata'), '') <> 'object' or octet_length((input -> 'metadata')::text) > 64000 then
        raise invalid_parameter_value;
      end if;
      insert into memory_storage.memories (caller, tag, custom_id, content, metadata, embedding, title, revision)
        values (gate.caller, tag_value, custom_id_value, content_value, input -> 'metadata',
          memory_storage.embedding(input -> 'embedding'),
          case when jsonb_typeof(input #> '{metadata,memoryKey}') = 'string' then input #>> '{metadata,memoryKey}' end,
          memory_storage.next_revision(gate.caller)::bigint)
        returning * into target;
    end if;
    return memory_storage.reply(jsonb_build_object('id', target.id, 'status', target.status, 'revision', target.revision::text));
  end if;

  if operation = 'read_by_custom_id' then
    select * into target from memory_storage.memories where caller = gate.caller and tag = tag_value
      and custom_id = custom_id_value and status = 'done';
  else
    if input ->> 'id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then
      target_id := (input ->> 'id')::uuid;
    end if;
    select * into target from memory_storage.memories where caller = gate.caller and tag = tag_value
      and id = target_id
      and (operation = 'forget' or (status = 'done' and (gate.caller = 'people-registry' or (
        metadata ->> 'userId' = input ->> 'userId' and metadata ->> 'wsId' = input ->> 'wsId'
        and metadata ->> 'product' = input ->> 'product'
      ))));
  end if;

  if operation = 'read' or operation = 'read_by_custom_id' then
    if target.id is null then return memory_storage.reply(missing, 404); end if;
    return memory_storage.reply(jsonb_build_object('memory', memory_storage.view_row(target), 'snapshotRevision', gate.revision::text));
  end if;
  if operation = 'update' then
    if target.id is null or target.revision::text is distinct from input ->> 'revision' then
      return memory_storage.reply(conflict, 409);
    end if;
    update memory_storage.memories set content = content_value, embedding = memory_storage.embedding(input -> 'embedding'),
      revision = memory_storage.next_revision(gate.caller)::bigint, updated_at = clock_timestamp()
      where id = target.id returning * into target;
    return memory_storage.reply(jsonb_build_object('updated', true, 'memory', memory_storage.view_row(target)));
  end if;

  if target.id is null or target.status = 'forgotten' then
    return memory_storage.reply(jsonb_build_object('forgotten', target.id is not null, 'id', input ->> 'id'));
  end if;
  if input ? 'revision' and target.revision::text is distinct from input ->> 'revision' then
    return memory_storage.reply(conflict, 409);
  end if;
  if input ? 'replacement' and (not (input ? 'revision') or not memory_storage.has_replacement(
    gate.caller, tag_value, input -> 'replacement', target.id)) then
    return memory_storage.reply('{"error":"replacement_unconfirmed"}', 409);
  end if;
  if char_length(input ->> 'reason') > 256 then raise invalid_parameter_value; end if;
  update memory_storage.memories set status = 'forgotten', forgotten_at = now(), forget_reason = input ->> 'reason',
    revision = memory_storage.next_revision(gate.caller)::bigint, updated_at = clock_timestamp()
    where id = target.id returning * into target;
  return memory_storage.reply(jsonb_build_object('forgotten', true, 'id', target.id, 'revision', target.revision::text));
end
$$;
revoke all on function memory_api.execute(uuid, text, text[], jsonb) from public, anon, authenticated, service_role;
-- tuturuuu: reviewed(alter-routine-review): apps/database/supabase/tests/memory-postgrest-boundary.sql
alter function memory_api.execute(uuid, text, text[], jsonb) owner to memory_rpc_owner;

revoke all on function
  memory_storage.caller(), memory_storage.check_scope(text, text, text),
  memory_storage.last_fence(text), memory_storage.advance_fence(text),
  memory_storage.check_tags(text, text, text[]), memory_storage.consume(uuid, text, text[]),
  memory_storage.reply(jsonb, integer), memory_storage.next_revision(text),
  memory_storage.view_row(memory_storage.memories), memory_storage.embedding(jsonb),
  memory_storage.has_replacement(text, text, jsonb, uuid), memory_storage.purge(text, text, bigint, jsonb),
  memory_storage.search(text, text, jsonb, integer)
  from public, anon, authenticated, service_role;
grant execute on function
  memory_storage.caller(), memory_storage.check_scope(text, text, text),
  memory_storage.last_fence(text), memory_storage.advance_fence(text),
  memory_storage.check_tags(text, text, text[]), memory_storage.consume(uuid, text, text[]),
  memory_storage.reply(jsonb, integer), memory_storage.next_revision(text),
  memory_storage.view_row(memory_storage.memories), memory_storage.embedding(jsonb),
  memory_storage.has_replacement(text, text, jsonb, uuid), memory_storage.purge(text, text, bigint, jsonb),
  memory_storage.search(text, text, jsonb, integer) to memory_rpc_owner;
set local role memory_rpc_owner;
revoke execute on all functions in schema memory_api from public, anon, authenticated, service_role;
grant execute on function memory_api.reserve(uuid, text, text[]), memory_api.execute(uuid, text, text[], jsonb) to memory_rpc;
reset role;
revoke create on schema memory_storage, memory_api from memory_rpc_owner;
create function memory_gateway.assert_role_boundary(public_roles oid[]) returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  violation text;
begin
  if exists (select from unnest(public_roles) r where not has_schema_privilege(r, 'public', 'USAGE')) then
    raise exception 'Existing roles would lose public schema access' using detail = (
      select string_agg(rolname, ', ' order by rolname) from pg_roles
      where oid = any(public_roles) and not has_schema_privilege(oid, 'public', 'USAGE'));
  end if;
  if not public_roles @> memory_gateway.public_role_access() then
    raise exception 'Existing roles would gain public schema access';
  end if;
  -- Hosted role creation can add postgres memberships. A role that can SET postgres already owns these objects.
  select string_agg(item, '; ' order by item) into violation from (
    select format('%s member of %s (admin=%s, inherit=%s, set=%s)', m.member::regrole, m.roleid::regrole,
      m.admin_option::text, m.inherit_option::text, m.set_option::text) as item
    from pg_auth_members m
    where m.member in ('memory_rpc'::regrole, 'memory_rpc_owner'::regrole)
      or (m.roleid in ('memory_rpc'::regrole, 'memory_rpc_owner'::regrole)
        and not exists (select from pg_roles e where e.oid = m.member
          and (e.rolsuper or pg_has_role(e.oid, 'postgres', 'SET')))
        and not (m.roleid = 'memory_rpc'::regrole and m.member = 'authenticator'::regrole
          and m.set_option and not m.admin_option and not m.inherit_option))
    union all
    -- The session-origin check refuses a memory_rpc session that did not log in as authenticator.
    select format('%s can set or inherit %s', r.rolname, t.target)
    from pg_roles r, (values ('memory_rpc'::regrole), ('memory_rpc_owner'::regrole)) as t(target)
    where not r.rolsuper and r.oid <> t.target and pg_has_role(r.oid, t.target, 'USAGE, SET')
      and not pg_has_role(r.oid, 'postgres', 'USAGE, SET')
      and not (t.target = 'memory_rpc'::regrole and pg_has_role(r.oid, 'authenticator', 'SET'))
  ) as v;
  if violation is not null or not pg_has_role('authenticator', 'memory_rpc', 'SET') or not pg_has_role('postgres', 'memory_rpc_owner', 'SET') then
    raise exception 'Unexpected memory role membership' using detail = coalesce(violation, 'required SET authority missing');
  end if;
  -- Managed net and pgsodium may keep PUBLIC-only USAGE, which gives memory_rpc nothing anon lacks. CREATE is always refused.
  select string_agg(format('%s (owner %s, extension %s)', n.nspname, n.nspowner::regrole, coalesce((select string_agg(e.extname, '+')
      from pg_extension e where e.extnamespace = n.oid or exists (select from pg_depend d where d.classid = 'pg_namespace'::regclass
        and d.objid = n.oid and d.refobjid = e.oid and d.deptype = 'e')), 'none')), ', ' order by n.nspname) into violation
  from pg_namespace n, lateral (select coalesce(n.nspacl, acldefault('n', n.nspowner)) as acl) as s
  where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
    and (has_schema_privilege('memory_rpc', n.oid, 'CREATE') or (n.nspname not in ('memory_api', 'memory_gateway')
      and not (n.nspname in ('net', 'pgsodium') and not pg_has_role('memory_rpc', n.nspowner, 'USAGE, SET')
        and exists (select from aclexplode(s.acl) a where a.grantee = 0 and a.privilege_type = 'USAGE')
        and not exists (select from aclexplode(s.acl) a where a.grantee <> 0 and pg_has_role('memory_rpc', a.grantee, 'USAGE, SET')))
      and has_schema_privilege('memory_rpc', n.oid, 'USAGE')));
  if violation is not null or has_schema_privilege('memory_rpc_owner', 'public', 'USAGE, CREATE') or exists (select from pg_roles
    where rolname in ('memory_rpc', 'memory_rpc_owner') and (rolcanlogin or rolinherit or rolbypassrls or rolsuper or rolreplication or rolcreaterole or rolcreatedb))
    or exists (select from pg_db_role_setting s, unnest(s.setconfig) as setting
      where s.setrole in (0, 'authenticator'::regrole)
        and s.setdatabase in (0, (select oid from pg_database where datname = current_database()))
        and setting like 'pgrst.db_schemas=%' and setting ~* '\m(net|pgsodium)\M') then
    raise exception 'Unexpected memory schema access' using detail = coalesce('memory_rpc schemas: ' || violation, 'owner public access, role attributes or exposed net');
  end if;
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into violation from pg_proc p
  where (p.pronamespace in ('memory_api'::regnamespace, 'memory_gateway'::regnamespace) and has_function_privilege('memory_rpc', p.oid, 'EXECUTE')
      and p.oid not in ('memory_api.reserve(uuid,text,text[])'::regprocedure,
        'memory_api.execute(uuid,text,text[],jsonb)'::regprocedure, 'memory_gateway.check_request()'::regprocedure))
    or (p.pronamespace = 'memory_api'::regnamespace and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('service_role', p.oid, 'EXECUTE')));
  if violation is not null or exists (select from pg_class where relnamespace in ('memory_api'::regnamespace, 'memory_gateway'::regnamespace)) then
    raise exception 'Unexpected memory object access' using detail = coalesce('functions: ' || violation, 'relations in API schemas');
  end if;
end
$$;
revoke all on function memory_gateway.assert_role_boundary(oid[]) from public, anon, authenticated, service_role;
select memory_gateway.assert_role_boundary(roles) from pg_temp.memory_public_role_baseline;
select memory_gateway.assert_account_hook_acl();
select memory_gateway.assert_effective_acl();
commit;
