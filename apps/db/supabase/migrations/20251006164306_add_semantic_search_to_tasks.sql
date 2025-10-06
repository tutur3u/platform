-- Enable pgvector extension for semantic search
create extension if not exists vector with schema extensions;

-- Add embedding column to tasks table (768 dimensions for Gemini)
alter table tasks add column if not exists embedding extensions.vector(768);

-- Add full-text search column for hybrid search
alter table tasks add column if not exists fts tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) stored;

-- Create index for vector similarity search (using HNSW for better performance)
create index if not exists tasks_embedding_idx on tasks
using hnsw (embedding extensions.vector_cosine_ops);

-- Create GIN index for full-text search
create index if not exists tasks_fts_idx on tasks using gin(fts);

-- Create hybrid search function using weighted combination
create or replace function match_tasks (
  query_embedding extensions.vector(768),
  query_text text,
  match_threshold float default 0.3,
  match_count int default 50,
  filter_ws_id uuid default null,
  filter_deleted boolean default false
) returns table (
  id uuid,
  name text,
  description text,
  list_id uuid,
  start_date timestamptz,
  end_date timestamptz,
  completed boolean,
  archived boolean,
  similarity float
)
language plpgsql
as $$
#variable_conflict use_column
begin
  return query
  with semantic_search as (
    select
      tasks.id,
      (1.0 - (tasks.embedding <=> query_embedding)) as semantic_similarity,
      row_number() over (order by tasks.embedding <=> query_embedding) as semantic_rank
    from tasks
    inner join task_lists on tasks.list_id = task_lists.id
    inner join workspace_boards on task_lists.board_id = workspace_boards.id
    where
      tasks.embedding is not null
      and (filter_ws_id is null or workspace_boards.ws_id = filter_ws_id)
      and tasks.deleted = filter_deleted
    order by tasks.embedding <=> query_embedding
    limit least(match_count * 3, 150)
  ),
  keyword_search as (
    select
      tasks.id,
      ts_rank_cd(tasks.fts, websearch_to_tsquery('english', query_text)) as keyword_score,
      row_number() over (order by ts_rank_cd(tasks.fts, websearch_to_tsquery('english', query_text)) desc) as keyword_rank
    from tasks
    inner join task_lists on tasks.list_id = task_lists.id
    inner join workspace_boards on task_lists.board_id = workspace_boards.id
    where
      tasks.fts @@ websearch_to_tsquery('english', query_text)
      and (filter_ws_id is null or workspace_boards.ws_id = filter_ws_id)
      and tasks.deleted = filter_deleted
    order by ts_rank_cd(tasks.fts, websearch_to_tsquery('english', query_text)) desc
    limit least(match_count * 3, 150)
  ),
  combined_results as (
    select
      coalesce(s.id, k.id) as id,
      coalesce(s.semantic_similarity, 0.0) as semantic_similarity,
      coalesce(k.keyword_score, 0.0) as keyword_score,
      -- Heavily weight keyword matches (70%) over semantic (30%)
      -- This ensures exact matches rank higher
      (coalesce(k.keyword_score, 0.0) * 0.7 + coalesce(s.semantic_similarity, 0.0) * 0.3) as combined_score
    from semantic_search s
    full outer join keyword_search k on s.id = k.id
  )
  select
    tasks.id,
    tasks.name,
    tasks.description,
    tasks.list_id,
    tasks.start_date,
    tasks.end_date,
    tasks.completed,
    tasks.archived,
    cr.combined_score::float as similarity
  from combined_results cr
  inner join tasks on tasks.id = cr.id
  inner join task_lists on tasks.list_id = task_lists.id
  inner join workspace_boards on task_lists.board_id = workspace_boards.id
  where (filter_ws_id is null or workspace_boards.ws_id = filter_ws_id)
    and tasks.deleted = filter_deleted
  order by cr.combined_score desc
  limit least(match_count, 200);
end;
$$;

-- Grant execute permission on the function
grant execute on function match_tasks to authenticated;

-- Add comment explaining the vector dimension
comment on column tasks.embedding is 'Google Gemini gemini-embedding-001 embedding vector (768 dimensions, SEMANTIC_SIMILARITY task type, using Matryoshka Representation Learning)';

-- Note: Automatic embedding generation is handled by:
-- 1. Cron job: /api/cron/tasks/generate-embeddings (runs daily)
-- 2. On-demand: POST /api/v1/workspaces/[wsId]/tasks/embeddings/generate (batch generation)
-- 3. Single task: POST /api/v1/workspaces/[wsId]/tasks/[taskId]/embedding
