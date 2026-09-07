create or replace function public.create_scheduled_workspace_meeting(
  p_meeting_id uuid,
  p_ws_id uuid,
  p_creator_id uuid,
  p_name text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_encrypted_title text,
  p_encrypted_description text,
  p_encrypted_location text,
  p_is_encrypted boolean,
  p_meeting_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  meeting_row public.workspace_meetings;
  calendar_row public.workspace_calendar_events;
begin
  if p_end_at <= p_start_at then
    raise exception 'meeting end time must be after its start time';
  end if;

  insert into public.workspace_meetings (id, ws_id, name, time, creator_id)
  values (p_meeting_id, p_ws_id, p_name, p_start_at, p_creator_id)
  returning * into meeting_row;

  insert into public.workspace_calendar_events (
    ws_id, title, description, location, start_at, end_at, color,
    is_encrypted, provider, scheduling_source, scheduling_metadata, sync_status
  )
  values (
    p_ws_id, p_encrypted_title, p_encrypted_description,
    p_encrypted_location, p_start_at, p_end_at, 'BLUE', p_is_encrypted,
    'tuturuuu', 'manual',
    jsonb_build_object(
      'type', 'tuturuuu_meeting',
      'meeting_id', p_meeting_id,
      'meeting_url', p_meeting_url
    ),
    'local_only'
  )
  returning * into calendar_row;

  return jsonb_build_object(
    'meeting', to_jsonb(meeting_row),
    'calendar_event', to_jsonb(calendar_row)
  );
end;
$$;

revoke all on function public.create_scheduled_workspace_meeting(
  uuid, uuid, uuid, text, timestamptz, timestamptz,
  text, text, text, boolean, text
) from public, anon, authenticated;

grant execute on function public.create_scheduled_workspace_meeting(
  uuid, uuid, uuid, text, timestamptz, timestamptz,
  text, text, text, boolean, text
) to service_role;

comment on function public.create_scheduled_workspace_meeting(
  uuid, uuid, uuid, text, timestamptz, timestamptz,
  text, text, text, boolean, text
) is 'Atomically creates a Meet room and encrypted native Calendar event. Service role only; callers authorize access first.';
