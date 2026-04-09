alter table public.sepay_webhook_endpoints
  add column if not exists deleted_at timestamptz;

create index if not exists idx_sepay_webhook_endpoints_ws_deleted_active
  on public.sepay_webhook_endpoints (ws_id, active, created_at desc)
  where deleted_at is null;

comment on column public.sepay_webhook_endpoints.deleted_at is
  'Soft-delete timestamp. Rows are retained for event integrity and audit trails.';
