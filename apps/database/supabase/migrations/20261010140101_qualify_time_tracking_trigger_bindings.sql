-- Invoker triggers inherit the empty path of the replacement definer.
-- Qualify their bindings without changing predicates, privileges or accounting.
create or replace function public.stop_other_running_sessions()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_running = true then
    update public.time_tracking_sessions
    set is_running = false,
        end_time = coalesce(end_time, now()),
        updated_at = now()
    where ws_id = new.ws_id
      and user_id = new.user_id
      and id != new.id
      and is_running = true;
  end if;
  return new;
end;
$$;

create or replace function public.update_productivity_score()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.duration_seconds is not null and new.category_id is not null then
    new.productivity_score := public.calculate_productivity_score(
      new.duration_seconds,
      (select color from public.time_tracking_categories where id = new.category_id)
    );
  else
    new.productivity_score := 0;
  end if;
  return new;
end;
$$;
