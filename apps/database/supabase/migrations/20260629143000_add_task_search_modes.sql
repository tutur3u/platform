drop function if exists public.match_tasks(
  extensions.vector,
  text,
  float,
  int,
  uuid,
  boolean
);

drop function if exists public.match_tasks(
  extensions.halfvec,
  text,
  float,
  int,
  uuid,
  boolean
);

drop function if exists public.match_tasks(
  extensions.halfvec,
  text,
  float,
  int,
  uuid,
  boolean,
  text
);

create or replace function public.match_tasks (
  query_embedding extensions.halfvec(3072),
  query_text text,
  match_threshold float default 0.3,
  match_count int default 50,
  filter_ws_id uuid default null,
  filter_deleted boolean default false,
  search_mode text default 'hybrid'
) returns table (
  id uuid,
  name text,
  description text,
  list_id uuid,
  list_name text,
  list_status task_board_status,
  board_id uuid,
  board_name text,
  priority task_priority,
  start_date timestamptz,
  end_date timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz,
  similarity float
)
language plpgsql
as $$
#variable_conflict use_column
declare
  normalized_search_mode text := lower(coalesce(nullif(trim(search_mode), ''), 'hybrid'));
begin
  if normalized_search_mode not in ('text', 'semantic', 'hybrid') then
    raise exception 'Invalid task search mode: %', search_mode
      using errcode = '22023';
  end if;

  return query
  with semantic_search as (
    select
      tasks.id,
      (1.0 - (tasks.embedding <=> query_embedding)) as semantic_similarity,
      row_number() over (order by tasks.embedding <=> query_embedding) as semantic_rank
    from public.tasks
    inner join public.task_lists on tasks.list_id = task_lists.id
    inner join public.workspace_boards on task_lists.board_id = workspace_boards.id
    where
      normalized_search_mode in ('semantic', 'hybrid')
      and query_embedding is not null
      and tasks.embedding is not null
      and (filter_ws_id is null or workspace_boards.ws_id = filter_ws_id)
      and (filter_deleted or tasks.deleted_at is null)
    order by tasks.embedding <=> query_embedding
    limit least(greatest(match_count, 1) * 3, 150)
  ),
  keyword_search as (
    select
      tasks.id,
      ts_rank_cd(tasks.fts, websearch_to_tsquery('english', query_text)) as keyword_score,
      row_number() over (
        order by ts_rank_cd(tasks.fts, websearch_to_tsquery('english', query_text)) desc
      ) as keyword_rank
    from public.tasks
    inner join public.task_lists on tasks.list_id = task_lists.id
    inner join public.workspace_boards on task_lists.board_id = workspace_boards.id
    where
      normalized_search_mode in ('text', 'hybrid')
      and nullif(trim(query_text), '') is not null
      and tasks.fts @@ websearch_to_tsquery('english', query_text)
      and (filter_ws_id is null or workspace_boards.ws_id = filter_ws_id)
      and (filter_deleted or tasks.deleted_at is null)
    order by ts_rank_cd(tasks.fts, websearch_to_tsquery('english', query_text)) desc
    limit least(greatest(match_count, 1) * 3, 150)
  ),
  combined_results as (
    select
      coalesce(s.id, k.id) as id,
      coalesce(s.semantic_similarity, 0.0) as semantic_similarity,
      coalesce(k.keyword_score, 0.0) as keyword_score,
      (coalesce(1.0 / (60 + s.semantic_rank), 0.0) +
       coalesce(1.0 / (60 + k.keyword_rank), 0.0)) as reciprocal_rank_score,
      case normalized_search_mode
        when 'text' then coalesce(k.keyword_score, 0.0)
        when 'semantic' then coalesce(s.semantic_similarity, 0.0)
        else (coalesce(k.keyword_score, 0.0) * 0.7 + coalesce(s.semantic_similarity, 0.0) * 0.3)
      end as combined_score
    from semantic_search s
    full outer join keyword_search k on s.id = k.id
  ),
  ranked_results as (
    select
      tasks.id,
      tasks.name,
      tasks.description,
      tasks.list_id,
      task_lists.name as list_name,
      task_lists.status as list_status,
      workspace_boards.id as board_id,
      workspace_boards.name as board_name,
      tasks.priority,
      tasks.start_date,
      tasks.end_date,
      tasks.completed_at,
      tasks.closed_at,
      tasks.created_at,
      cr.semantic_similarity,
      cr.keyword_score,
      cr.combined_score,
      cr.reciprocal_rank_score,
      case
        when task_lists.status in ('active', 'not_started') then 1.0
        else 0.5
      end as status_boost,
      (cr.reciprocal_rank_score * 0.7 +
       cr.combined_score * 0.15 +
       case
         when task_lists.status in ('active', 'not_started') then 0.15
         else 0.0
       end) as final_score
    from combined_results cr
    inner join public.tasks on tasks.id = cr.id
    inner join public.task_lists on tasks.list_id = task_lists.id
    inner join public.workspace_boards on task_lists.board_id = workspace_boards.id
    where (filter_ws_id is null or workspace_boards.ws_id = filter_ws_id)
      and (filter_deleted or tasks.deleted_at is null)
      and (
        (normalized_search_mode = 'text' and cr.keyword_score > 0)
        or (normalized_search_mode = 'semantic' and cr.semantic_similarity >= match_threshold)
        or (
          normalized_search_mode = 'hybrid'
          and (
            cr.keyword_score > 0
            or cr.semantic_similarity >= match_threshold
          )
        )
      )
  )
  select
    id,
    name,
    description,
    list_id,
    list_name,
    list_status,
    board_id,
    board_name,
    priority,
    start_date,
    end_date,
    completed_at,
    closed_at,
    created_at,
    final_score::float as similarity
  from ranked_results
  order by final_score desc
  limit least(greatest(match_count, 1), 200);
end;
$$;

grant execute on function public.match_tasks(
  extensions.halfvec,
  text,
  float,
  int,
  uuid,
  boolean,
  text
) to authenticated;

comment on function public.match_tasks(
  extensions.halfvec,
  text,
  float,
  int,
  uuid,
  boolean,
  text
) is
  'Task search using text, semantic, or hybrid modes. Text mode uses tasks.fts only; semantic mode uses embeddings only; hybrid combines both and keeps keyword matches independent from the semantic threshold.';
