begin;

create schema memory_worker;
revoke all on schema memory_worker from public;

alter table public.memories
  add column worker_caller text,
  add column worker_revision bigint not null default 0,
  add constraint memories_worker_scope_check check (
    worker_caller is null or (
      custom_id is not null and worker_revision > 0 and (
        (worker_caller = 'assistant' and starts_with(container_tag, 'tuturuuu.user.'))
        or (worker_caller = 'people-registry' and starts_with(container_tag, 'tuturuuu.people.'))
      )
    )
  );

create unique index memories_worker_custom_id_idx
  on public.memories (worker_caller, custom_id)
  where worker_caller is not null;

create index memories_worker_tag_idx
  on public.memories (worker_caller, container_tag, custom_id)
  where worker_caller is not null;

create table memory_worker.admission (
  caller text primary key check (caller in ('assistant', 'people-registry')),
  stopped boolean not null default true,
  epoch bigint not null default 0 check (epoch >= 0),
  remaining integer not null default 0 check (remaining between 0 and 100000),
  revision bigint not null default 0 check (revision >= 0)
);

create function memory_worker.advance_epoch()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.stopped is distinct from new.stopped then
    new.epoch := old.epoch + 1;
  end if;
  return new;
end;
$$;

revoke all on function memory_worker.advance_epoch() from public;
create trigger advance_epoch
  before update of stopped on memory_worker.admission
  for each row execute function memory_worker.advance_epoch();

insert into memory_worker.admission (caller)
values ('assistant'), ('people-registry');

create table memory_worker.retired_ids (
  caller text not null references memory_worker.admission (caller),
  custom_id text not null,
  primary key (caller, custom_id)
);

create table memory_worker.retired_tags (
  caller text not null references memory_worker.admission (caller),
  container_tag text not null,
  primary key (caller, container_tag)
);

create table memory_worker.purge_receipts (
  caller text not null references memory_worker.admission (caller),
  request_id uuid not null,
  request_digest text not null check (length(request_digest) = 64),
  receipt jsonb not null,
  created_at timestamptz not null default now(),
  primary key (caller, request_id)
);

create role memory_worker_runtime nologin;
grant usage on schema public, extensions, memory_worker to memory_worker_runtime;
grant select, insert, delete on public.memories to memory_worker_runtime;
grant update (content, embedding, summary, status, forget_reason, forgotten_at, worker_revision)
  on public.memories to memory_worker_runtime;
grant select on memory_worker.admission to memory_worker_runtime;
grant update (remaining, revision)
  on memory_worker.admission to memory_worker_runtime;
grant select, insert on memory_worker.retired_ids, memory_worker.retired_tags,
  memory_worker.purge_receipts to memory_worker_runtime;

commit;
