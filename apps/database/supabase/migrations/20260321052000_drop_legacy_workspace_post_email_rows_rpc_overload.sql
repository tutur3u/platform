drop function if exists public.get_workspace_post_email_rows(
  uuid,
  uuid[],
  uuid[],
  uuid,
  text,
  timestamptz,
  integer,
  integer
);

comment on function public.get_workspace_post_email_rows(
  uuid,
  uuid[],
  uuid[],
  uuid,
  text,
  public.approval_status,
  timestamptz,
  integer,
  integer
) is
'Returns paginated workspace post email deliveries with computed queue and approval status filtering so server-side pagination stays aligned with the dashboard filters.';
