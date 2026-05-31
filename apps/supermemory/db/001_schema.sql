create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table if not exists public.memories (
  id text primary key,
  container_tag text not null,
  custom_id text,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.halfvec(3072) not null,
  status text not null default 'done' check (status in ('done', 'forgotten')),
  summary text,
  title text,
  forget_reason text,
  forgotten_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fts tsvector generated always as (
    setweight(to_tsvector('english', coalesce(content, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(metadata::text, '')), 'B')
  ) stored
);

create index if not exists memories_container_status_updated_idx
  on public.memories (container_tag, status, updated_at desc);

create index if not exists memories_metadata_gin_idx
  on public.memories using gin (metadata jsonb_path_ops);

create index if not exists memories_fts_idx
  on public.memories using gin (fts);

create index if not exists memories_embedding_hnsw_idx
  on public.memories using hnsw (embedding extensions.halfvec_cosine_ops);

create or replace function public.set_memory_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists memories_set_updated_at on public.memories;
create trigger memories_set_updated_at
  before update on public.memories
  for each row execute function public.set_memory_updated_at();
