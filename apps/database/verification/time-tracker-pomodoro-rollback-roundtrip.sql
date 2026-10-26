-- Run after the 20261026194000 rollback: every Pomodoro object is gone and the
-- foundation contract is back. Raises on the first difference.
do $$
begin
  if to_regprocedure('private.command_time_tracker_pomodoro(uuid,uuid,bigint,uuid,jsonb,jsonb,jsonb)') is not null
    or to_regprocedure('private._replace_running_session_locked(uuid,uuid,uuid,text,text,uuid,uuid,text[],boolean)') is not null
    or to_regprocedure('private._lock_time_tracker_actor_rows(uuid,uuid)') is not null then
    raise exception 'Pomodoro functions remain';
  end if;
  if exists(select 1 from pg_attribute where attrelid='private.time_tracker_controls'::regclass
    and attname in ('remaining_ms','completed_focus','task_id','title') and not attisdropped) then
    raise exception 'Pomodoro columns remain';
  end if;
  if (select array_agg(conname||':'||pg_get_constraintdef(oid) order by conname) from pg_constraint
    where conrelid='private.time_tracker_controls'::regclass and contype='c'
      and conname in ('time_tracker_controls_mode_check','time_tracker_controls_phase_check',
        'time_tracker_controls_deadline_at_check','time_tracker_controls_phase_shape'))
    is distinct from array['time_tracker_controls_deadline_at_check:CHECK ((deadline_at IS NULL))',
      'time_tracker_controls_mode_check:CHECK ((mode = ''off''::text))',
      'time_tracker_controls_phase_check:CHECK ((phase = ''idle''::text))'] then
    raise exception 'Foundation checks not restored';
  end if;
  if exists(select 1 from private.time_tracker_controls where mode<>'off' or phase<>'idle'
    or deadline_at is not null) then
    raise exception 'A control is still active';
  end if;
  if (select prosrc like '%_replace_running_session_locked%' from pg_proc
    where oid='private.replace_running_time_tracker_session(uuid,uuid,bigint,uuid,uuid,text,text,uuid,uuid)'::regprocedure)
    or (select prosrc like '%time-tracker-pomodoro%' from pg_proc
    where oid='private.cloudflare_channel_role(uuid,text)'::regprocedure) then
    raise exception 'Prior function bodies not restored';
  end if;
  if not has_function_privilege('service_role','private.replace_running_time_tracker_session(uuid,uuid,bigint,uuid,uuid,text,text,uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','private.replace_running_time_tracker_session(uuid,uuid,bigint,uuid,uuid,text,text,uuid,uuid)','EXECUTE') then
    raise exception 'Replace grants changed';
  end if;
  raise notice 'time-tracker pomodoro rollback verified';
end $$;
