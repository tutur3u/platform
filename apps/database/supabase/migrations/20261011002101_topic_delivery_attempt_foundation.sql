-- Inert foundation only: no claim/dispatch/mutation RPC, caller or backfill.
alter table private.topic_announcements
  add column delivery_revision bigint not null default 0,
  add constraint topic_announcements_delivery_revision_nonnegative
    check (delivery_revision >= 0),
  add constraint topic_announcements_delivery_scope_unique unique (id, ws_id);

create table private.topic_announcement_delivery_attempts (
  id uuid primary key,
  announcement_id uuid not null,
  ws_id uuid not null,
  actor_id uuid not null references public.users(id) on delete restrict,
  snapshot jsonb not null,
  outcome text not null default 'dispatching',
  created_at timestamptz not null default now(),
  dispatch_started_at timestamptz not null default now(),
  completed_at timestamptz,
  outcome_reason text,
  provider_message_id text,
  email_audit_id uuid references public.email_audit(id) on delete restrict,
  constraint topic_delivery_parent_scope foreign key (announcement_id, ws_id)
    references private.topic_announcements(id, ws_id) on delete restrict,
  constraint topic_delivery_snapshot_shape check (
    jsonb_typeof(snapshot) = 'object'
    and jsonb_typeof(snapshot->'payload') = 'object'
    and jsonb_typeof(snapshot->'recipients') = 'array'
    and jsonb_typeof(snapshot->'attachments') = 'array'
    and snapshot ?& array['payload','recipients','attachments']
  ),
  constraint topic_delivery_outcome check (
    outcome in ('dispatching','sent','rejected','uncertain')
  ),
  constraint topic_delivery_completion check (
    (outcome = 'dispatching' and completed_at is null and outcome_reason is null)
    or (outcome <> 'dispatching' and completed_at is not null)
  ),
  constraint topic_delivery_times check (
    dispatch_started_at >= created_at
    and (completed_at is null or completed_at >= dispatch_started_at)
  ),
  constraint topic_delivery_uncertain_reason check (
    outcome <> 'uncertain' or outcome_reason is not distinct from 'DELIVERY_UNCERTAIN'
  )
);

create unique index topic_delivery_one_unresolved_attempt
  on private.topic_announcement_delivery_attempts(announcement_id)
  where outcome in ('dispatching','uncertain');

create function private.enforce_topic_delivery_attempt_immutability()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode='55000', message='Delivery attempt history is immutable';
  end if;
  if row(new.id,new.announcement_id,new.ws_id,new.actor_id,new.snapshot,
         new.created_at,new.dispatch_started_at)
     is distinct from
     row(old.id,old.announcement_id,old.ws_id,old.actor_id,old.snapshot,
         old.created_at,old.dispatch_started_at) then
    raise exception using errcode='55000', message='Delivery attempt identity is immutable';
  end if;
  if old.outcome in ('sent','rejected') and new is distinct from old then
    raise exception using errcode='55000', message='Delivery attempt terminal receipt is immutable';
  end if;
  if old.outcome = 'uncertain' and new.outcome not in ('uncertain','sent') then
    raise exception using errcode='55000', message='Delivery uncertainty requires reconciliation';
  end if;
  return new;
end;
$$;
create trigger topic_delivery_attempt_immutability
  before update or delete on private.topic_announcement_delivery_attempts
  for each row execute function private.enforce_topic_delivery_attempt_immutability();

alter table private.topic_announcement_delivery_attempts enable row level security;
create policy topic_delivery_service_read
  on private.topic_announcement_delivery_attempts for select to service_role using (true);
revoke all on private.topic_announcement_delivery_attempts from public,anon,authenticated,service_role;
grant select on private.topic_announcement_delivery_attempts to service_role;
revoke all on function private.enforce_topic_delivery_attempt_immutability() from public,anon,authenticated,service_role;

create function private.topic_delivery_foundation_readiness()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('version',1,'activationEnabled',false);
$$;
revoke all on function private.topic_delivery_foundation_readiness() from public,anon,authenticated;
grant execute on function private.topic_delivery_foundation_readiness() to service_role;

comment on table private.topic_announcement_delivery_attempts is
  'Inactive delivery foundation. No service write RPC exists; does not change existing sender/queue behavior or prove delivery.';
comment on column private.topic_announcements.delivery_revision is
  'Reserved atomic delivery revision; current callers do not advance or consume it.';
notify pgrst,'reload schema';
