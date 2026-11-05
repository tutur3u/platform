begin;

create or replace view private.time_tracking_requests_with_details
with (security_invoker = true)
as
select
  requests.*,
  case
    when requester.id is null then null
    else jsonb_build_object(
      'id', requester.id,
      'display_name', requester.display_name,
      'avatar_url', requester.avatar_url,
      'user_private_details', coalesce(
        (
          select jsonb_agg(jsonb_build_object('email', details.email))
          from public.user_private_details details
          where details.user_id = requester.id
        ),
        '[]'::jsonb
      )
    )
  end as "user",
  case
    when categories.id is null then null
    else jsonb_build_object(
      'id', categories.id,
      'name', categories.name,
      'color', categories.color
    )
  end as category,
  case
    when tasks.id is null then null
    else jsonb_build_object(
      'id', tasks.id,
      'name', tasks.name
    )
  end as task,
  case
    when approvers.id is null then null
    else jsonb_build_object(
      'id', approvers.id,
      'display_name', approvers.display_name
    )
  end as approved_by_user,
  case
    when rejecters.id is null then null
    else jsonb_build_object(
      'id', rejecters.id,
      'display_name', rejecters.display_name
    )
  end as rejected_by_user,
  case
    when needs_info_requesters.id is null then null
    else jsonb_build_object(
      'id', needs_info_requesters.id,
      'display_name', needs_info_requesters.display_name
    )
  end as needs_info_requested_by_user
from private.time_tracking_requests requests
left join public.users requester
  on requester.id = requests.user_id
left join public.time_tracking_categories categories
  on categories.id = requests.category_id
  and categories.ws_id = requests.workspace_id
left join public.tasks tasks
  on tasks.id = requests.task_id
  and exists (
    select 1
    from public.workspace_boards board
    where board.id = coalesce(
      tasks.board_id,
      (select list.board_id from public.task_lists list where list.id = tasks.list_id)
    )
      and board.ws_id = requests.workspace_id
  )
left join public.users approvers
  on approvers.id = requests.approved_by
left join public.users rejecters
  on rejecters.id = requests.rejected_by
left join public.users needs_info_requesters
  on needs_info_requesters.id = requests.needs_info_requested_by;

commit;
