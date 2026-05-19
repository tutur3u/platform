-- Supabase exposes public-schema views through the Data API when anon or
-- authenticated has SELECT. Views created by postgres run as security definer
-- unless explicitly marked as security_invoker, which can bypass RLS on the
-- underlying tables. Keep every client-facing public view bound to the caller.
do $$
declare
  exposed_view record;
begin
  for exposed_view in
    select n.nspname, c.relname
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
      and (
        has_table_privilege('anon', format('%I.%I', n.nspname, c.relname), 'select')
        or has_table_privilege(
          'authenticated',
          format('%I.%I', n.nspname, c.relname),
          'select'
        )
      )
  loop
    execute format(
      'alter view %I.%I set (security_invoker = true)',
      exposed_view.nspname,
      exposed_view.relname
    );
  end loop;
end $$;

-- Audit records are only served through permission-checked RPCs and API routes.
-- Direct REST access to the view is unnecessary and can expose sensitive table
-- names, record identifiers, and before/after payloads if a future view change
-- accidentally weakens its filters.
revoke select on table public.audit_logs from anon, authenticated;
grant select on table public.audit_logs to service_role;

comment on view public.audit_logs is
  'Audit log view for privileged server-side access only. Client roles must use permission-checked API routes/RPCs.';
