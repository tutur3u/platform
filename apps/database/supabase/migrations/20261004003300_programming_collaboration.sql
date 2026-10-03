create table private.learn_playground_collaborators (
  project_id uuid not null references private.learn_playgrounds(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check(role in ('editor','viewer')),
  granted_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  primary key(project_id,user_id)
);
alter table private.learn_playground_collaborators enable row level security;
revoke all on private.learn_playground_collaborators from public,anon,authenticated;
grant select,insert,update,delete on private.learn_playground_collaborators to service_role;
create function private.playground_collaboration_scope(p_actor_id uuid,p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('ownerId',p.actor_id,'role',case when p.actor_id=p_actor_id then 'owner' else c.role end)
  from private.learn_playgrounds p left join private.learn_playground_collaborators c on c.project_id=p.id and c.user_id=p_actor_id
  where p.id=p_id and (p.actor_id=p_actor_id or c.user_id=p_actor_id)
    and private.account_playgrounds_allowed(p.actor_id) and private.account_playgrounds_allowed(p_actor_id)
$$;
create function private.set_playground_collaborator(p_actor_id uuid,p_id uuid,p_user_id uuid,p_role text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if not private.account_playgrounds_allowed(p_actor_id) or not exists(select 1 from private.learn_playgrounds where id=p_id and actor_id=p_actor_id)
    then raise insufficient_privilege; end if;
  if p_user_id=p_actor_id then raise exception 'Owner role immutable' using errcode='22023'; end if;
  if p_role is null then delete from private.learn_playground_collaborators where project_id=p_id and user_id=p_user_id;
  elsif p_role in ('editor','viewer') then
    insert into private.learn_playground_collaborators(project_id,user_id,role,granted_by) values(p_id,p_user_id,p_role,p_actor_id)
      on conflict(project_id,user_id) do update set role=excluded.role,granted_by=excluded.granted_by,created_at=now();
  else raise exception 'Invalid collaboration role' using errcode='22023'; end if;
  return true;
end $$;
revoke all on function private.playground_collaboration_scope(uuid,uuid),private.set_playground_collaborator(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.playground_collaboration_scope(uuid,uuid),private.set_playground_collaborator(uuid,uuid,uuid,text) to service_role;

-- Test-mode results contain only public cases and remain learner/workspace/problem bound.
create function private.read_collaborative_programming_test(p_actor_id uuid,p_ws_id uuid,p_problem_id uuid,p_submission_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('status',r.status,'output',(
    select e.message from private.devbox_run_events e where e.run_id=r.id and e.event_type='judge_result' order by e.created_at desc limit 1))
  from private.learn_coding_submissions s join private.devbox_runs r on r.id=s.run_id
  where s.id=p_submission_id and s.user_id=p_actor_id and s.ws_id=p_ws_id and s.problem_id=p_problem_id and s.problem_bound and s.kind='test'
$$;
revoke all on function private.read_collaborative_programming_test(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.read_collaborative_programming_test(uuid,uuid,uuid,uuid) to service_role;

create function private.enqueue_meeting_programming_test(p_meeting_id uuid,p_actor_id uuid,p_problem_id uuid,p_source text,p_language text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_meeting public.workspace_meetings; v_problem private.learn_programming_problems; v_cases jsonb; v_command text[]; v_id uuid;
begin
 select * into v_meeting from public.workspace_meetings where id=p_meeting_id;
 if not found or not private.meeting_programming_elevated(p_meeting_id,v_meeting.creator_id) then raise insufficient_privilege; end if;
 if p_language not in ('python','javascript','typescript','c','cpp','java','rust','go','ruby','php') or length(p_source) not between 1 and 16000 then raise exception 'Invalid test' using errcode='22023'; end if;
 select * into v_problem from private.learn_programming_problems where id=p_problem_id and status='published' and (ws_id=v_meeting.ws_id or ws_id is null) for share;
 if not found then raise exception 'Problem missing' using errcode='P0002'; end if;
 select jsonb_agg(jsonb_build_object('input',input,'expected',expected,'visible',true) order by position) into v_cases from private.learn_programming_problem_cases where problem_id=p_problem_id and visible;
 if v_cases is null or jsonb_array_length(v_cases)>10 then raise exception 'Invalid public cases' using errcode='22023'; end if;
 v_command:=array['__ttr_judge_v1__',translate(rtrim(encode(convert_to(jsonb_build_object('source',p_source,'language',p_language,'cases',v_cases)::text,'UTF8'),'base64'),'='),E'+/\n','-_')];
 v_id:=private.enqueue_learn_coding_execution(v_meeting.ws_id,p_actor_id,v_problem.slug,p_source,v_command,p_language,'test');
 update private.learn_coding_submissions set problem_id=p_problem_id,problem_revision=v_problem.revision,problem_bound=true where id=v_id;
 return v_id;
end $$;
revoke all on function private.enqueue_meeting_programming_test(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function private.enqueue_meeting_programming_test(uuid,uuid,uuid,text,text) to service_role;
