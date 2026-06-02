-- Keep dynamic quiz answer keys off the public Data API surface.
--
-- The legacy public workspace_quizzes.answer column remains temporarily for
-- rollout compatibility, but this migration backfills the values into a
-- service-role-only private table and installs a trigger that moves any future
-- public answer write into private storage before commit.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

create table if not exists private.workspace_quiz_answers (
  quiz_id uuid primary key references public.workspace_quizzes(id)
    on update cascade
    on delete cascade,
  answer jsonb not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

insert into private.workspace_quiz_answers (quiz_id, answer, created_at, updated_at)
select
  id,
  answer,
  created_at,
  now()
from public.workspace_quizzes
where answer is not null
on conflict (quiz_id) do update
set
  answer = excluded.answer,
  updated_at = now();

alter table private.workspace_quiz_answers enable row level security;

revoke all on table private.workspace_quiz_answers
from public, anon, authenticated;

grant all on table private.workspace_quiz_answers to service_role;

drop policy if exists "Service role can manage private workspace quiz answers"
  on private.workspace_quiz_answers;

create policy "Service role can manage private workspace quiz answers"
  on private.workspace_quiz_answers
  for all
  to service_role
  using (true)
  with check (true);

create or replace function private.capture_workspace_quiz_answer()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if new.answer is not null then
    insert into private.workspace_quiz_answers (quiz_id, answer)
    values (new.id, new.answer)
    on conflict (quiz_id) do update
    set
      answer = excluded.answer,
      updated_at = now();

    update public.workspace_quizzes
    set answer = null
    where id = new.id
      and answer is not null;
  end if;

  return null;
end;
$$;

revoke all on function private.capture_workspace_quiz_answer()
from public, anon, authenticated;

grant execute on function private.capture_workspace_quiz_answer()
to service_role;

drop trigger if exists capture_workspace_quiz_answer
  on public.workspace_quizzes;

create trigger capture_workspace_quiz_answer
after insert or update of answer
on public.workspace_quizzes
for each row
when (new.answer is not null)
execute function private.capture_workspace_quiz_answer();

update public.workspace_quizzes
set answer = null
where answer is not null;
