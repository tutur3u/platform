begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.finance_bill_splits (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 120),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  minor_digits smallint not null check (minor_digits between 0 and 4),
  created_at timestamptz not null default now(),
  unique (ws_id, id)
);

create index finance_bill_splits_workspace_recency
  on private.finance_bill_splits (ws_id, created_at desc, id);

create table private.finance_bill_split_participants (
  id uuid not null,
  ws_id uuid not null,
  split_id uuid not null,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  contact_id uuid,
  member_id uuid,
  primary key (ws_id, split_id, id),
  unique (ws_id, split_id, contact_id),
  unique (ws_id, split_id, member_id),
  foreign key (ws_id, split_id)
    references private.finance_bill_splits(ws_id, id) on delete cascade,
  foreign key (ws_id, contact_id)
    references public.workspace_users(ws_id, id) on delete set null (contact_id),
  foreign key (ws_id, member_id)
    references public.workspace_members(ws_id, user_id) on delete set null (member_id),
  check (contact_id is null or member_id is null)
);

create index finance_bill_split_participants_member
  on private.finance_bill_split_participants (ws_id, member_id, split_id)
  where member_id is not null;

create index finance_bill_split_participants_contact
  on private.finance_bill_split_participants (ws_id, contact_id, split_id)
  where contact_id is not null;

create index finance_bill_splits_creator
  on private.finance_bill_splits (created_by)
  where created_by is not null;

create table private.finance_bill_split_revisions (
  ws_id uuid not null,
  split_id uuid not null,
  revision integer not null check (revision > 0),
  author_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  finalized boolean not null default false,
  input jsonb not null check (
    jsonb_typeof(input) = 'object' and pg_column_size(input) <= 524288
  ),
  ledger jsonb not null check (
    jsonb_typeof(ledger) = 'object' and pg_column_size(ledger) <= 524288
  ),
  primary key (ws_id, split_id, revision),
  foreign key (ws_id, split_id)
    references private.finance_bill_splits(ws_id, id) on delete cascade
);

create index finance_bill_split_revisions_author
  on private.finance_bill_split_revisions (author_id)
  where author_id is not null;

alter table private.finance_bill_splits enable row level security;
alter table private.finance_bill_split_participants enable row level security;
alter table private.finance_bill_split_revisions enable row level security;

revoke all on table private.finance_bill_splits,
  private.finance_bill_split_participants, private.finance_bill_split_revisions
  from public, anon, authenticated, service_role;

grant select, insert on table private.finance_bill_splits,
  private.finance_bill_split_participants, private.finance_bill_split_revisions
  to service_role;

create function private.create_finance_bill_split(
  p_ws_id uuid,
  p_actor_id uuid,
  p_id uuid,
  p_title text,
  p_currency text,
  p_minor_digits integer,
  p_participants jsonb,
  p_input jsonb,
  p_ledger jsonb,
  p_finalized boolean
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if not exists (
    select 1 from public.workspace_members
    where ws_id = p_ws_id and user_id = p_actor_id and type = 'MEMBER'
  ) then
    raise insufficient_privilege using message = 'Workspace access required';
  end if;

  if jsonb_typeof(p_participants) is distinct from 'array'
    or jsonb_array_length(p_participants) not between 1 and 100 then
    raise invalid_parameter_value using message = 'Invalid participants';
  end if;

  insert into private.finance_bill_splits (id, ws_id, created_by, title, currency, minor_digits)
    values (p_id, p_ws_id, p_actor_id, p_title, p_currency, p_minor_digits)
    on conflict (id) do nothing;

  if not found then
    if exists (
      select 1
      from private.finance_bill_splits as split
      join private.finance_bill_split_revisions as snapshot
        on snapshot.ws_id = split.ws_id and snapshot.split_id = split.id
      where split.id = p_id and split.ws_id = p_ws_id and split.created_by = p_actor_id
        and split.title = p_title and split.currency = p_currency
        and split.minor_digits = p_minor_digits and snapshot.revision = 1
        and snapshot.finalized = p_finalized and snapshot.input = p_input
    ) then
      return p_id;
    end if;
    raise sqlstate 'PT409' using message = 'Split creation conflicts with an existing operation';
  end if;

  insert into private.finance_bill_split_participants (
    id, ws_id, split_id, display_name, contact_id, member_id
  )
    select participant.id, p_ws_id, p_id, participant.display_name,
      participant.contact_id, participant.member_id
    from jsonb_to_recordset(p_participants)
      as participant(id uuid, display_name text, contact_id uuid, member_id uuid);

  insert into private.finance_bill_split_revisions (
    ws_id, split_id, revision, author_id, finalized, input, ledger
  ) values (p_ws_id, p_id, 1, p_actor_id, p_finalized, p_input, p_ledger);

  return p_id;
end;
$$;

revoke all on function private.create_finance_bill_split(
  uuid, uuid, uuid, text, text, integer, jsonb, jsonb, jsonb, boolean
) from public, anon, authenticated;
grant execute on function private.create_finance_bill_split(
  uuid, uuid, uuid, text, text, integer, jsonb, jsonb, jsonb, boolean
) to service_role;

create function private.read_finance_bill_splits(
  p_ws_id uuid,
  p_actor_id uuid,
  p_id uuid default null
) returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(jsonb_agg(page.result order by page.created_at desc, page.id), '[]'::jsonb)
  from (
    select split.id, split.created_at,
      jsonb_build_object(
        'id', split.id, 'title', split.title, 'createdAt', split.created_at,
        'currency', jsonb_build_object('code', split.currency, 'minorDigits', split.minor_digits),
        'revision', snapshot.revision, 'finalized', snapshot.finalized
      ) || case when p_id is not null then jsonb_build_object(
        'canManage', split.created_by = p_actor_id,
        'input', snapshot.input - 'participants',
        'ledger', snapshot.ledger,
        'participants', (
          select jsonb_agg(
            jsonb_build_object(
              'id', participant.id,
              'displayName', participant.display_name,
              'contactId', participant.contact_id,
              'canConfirm', coalesce(participant.member_id = p_actor_id, false) or actor.linked,
              'canReport', coalesce(participant.member_id = p_actor_id, false) or actor.linked or (
                split.created_by = p_actor_id and participant.member_id is null and not actor.has_link
              )
            )
            order by participant.id
          )
          from private.finance_bill_split_participants as participant
          cross join lateral (
            select coalesce(bool_or(link.platform_user_id = p_actor_id), false) as linked,
              count(*) > 0 as has_link
            from public.workspace_user_linked_users as link
            where link.ws_id = p_ws_id and link.virtual_user_id = participant.contact_id
          ) as actor
          where participant.ws_id = p_ws_id and participant.split_id = split.id
        )
      ) else '{}'::jsonb end as result
    from private.finance_bill_splits as split
    cross join lateral (
      select revision, finalized, input, ledger
      from private.finance_bill_split_revisions
      where ws_id = p_ws_id and split_id = split.id
      order by revision desc
      limit 1
    ) as snapshot
    where split.ws_id = p_ws_id and (p_id is null or split.id = p_id)
      and exists (
        select 1 from public.workspace_members
        where ws_id = p_ws_id and user_id = p_actor_id and type = 'MEMBER'
      )
      and (
        split.created_by = p_actor_id or exists (
          select 1
          from private.finance_bill_split_participants as participant
          where participant.ws_id = p_ws_id and participant.split_id = split.id
            and (
              participant.member_id = p_actor_id or exists (
                select 1 from public.workspace_user_linked_users as link
                where link.ws_id = p_ws_id and link.virtual_user_id = participant.contact_id
                  and link.platform_user_id = p_actor_id
              )
            )
        )
      )
    order by split.created_at desc, split.id
    limit 50
  ) as page;
$$;

revoke all on function private.read_finance_bill_splits(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.read_finance_bill_splits(uuid, uuid, uuid)
  to service_role;

commit;
