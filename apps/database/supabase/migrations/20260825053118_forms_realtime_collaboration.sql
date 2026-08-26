-- Realtime collaboration for the form studio.
--
-- Two people editing the same form had no way to see each other. The studio now
-- joins a private Supabase Realtime channel per form, carrying presence (who is
-- here, which block they are on) and broadcasts (someone saved, reload).
--
-- Broadcast and presence are used rather than `postgres_changes` because the
-- forms tables live in the `private` schema with service-role-only access —
-- they are deliberately off the public Data API, so a browser client cannot
-- subscribe to row changes on them at all.
--
-- Topic shape: `form-studio-<formId>`.

create schema if not exists private;

create or replace function private.can_join_form_realtime_topic(
  p_topic text,
  p_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  form_id_text text;
  topic_form_id uuid;
  topic_ws_id uuid;
begin
  if p_user_id is null or p_topic is null then
    return false;
  end if;

  if p_topic not like 'form-studio-%' then
    return false;
  end if;

  form_id_text := substring(p_topic from length('form-studio-') + 1);

  -- A topic whose suffix is not a uuid can never match a form. Reject it
  -- rather than letting the cast raise, which would surface as a channel error
  -- instead of a clean denial.
  begin
    topic_form_id := form_id_text::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  select forms.ws_id
  into topic_ws_id
  from private.forms forms
  where forms.id = topic_form_id;

  if topic_ws_id is null then
    return false;
  end if;

  -- Editing presence is gated on the same permission the studio itself
  -- requires. Analysts who can only read responses have no reason to appear in
  -- an editing session, and would leak their identity to editors if they did.
  return public.has_workspace_permission(
    topic_ws_id,
    p_user_id,
    'manage_forms'
  );
end;
$$;

revoke all on function private.can_join_form_realtime_topic(text, uuid)
from public, anon;

grant execute on function private.can_join_form_realtime_topic(text, uuid)
to authenticated;

-- Additive alongside the existing task-realtime policy. Multiple permissive
-- policies on `realtime.messages` are OR-ed, so this grants form topics without
-- touching board topics.
drop policy if exists "form studio realtime channels are scoped"
on realtime.messages;

create policy "form studio realtime channels are scoped"
on realtime.messages
for select
to authenticated
using (
  private = true
  and realtime.topic() like 'form-studio-%'
  and private.can_join_form_realtime_topic(realtime.topic(), auth.uid())
  and extension in ('broadcast', 'presence')
);

-- Broadcasting requires insert on `realtime.messages`; the task policy only
-- covers select because its broadcasts are all sent server-side with the
-- service role. Studio editors broadcast from the browser, so they need insert
-- on exactly the topics they may already read.
drop policy if exists "form studio realtime broadcasts are scoped"
on realtime.messages;

create policy "form studio realtime broadcasts are scoped"
on realtime.messages
for insert
to authenticated
with check (
  private = true
  and realtime.topic() like 'form-studio-%'
  and private.can_join_form_realtime_topic(realtime.topic(), auth.uid())
  and extension in ('broadcast', 'presence')
);
