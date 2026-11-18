-- The global row is the lock for admission policy changes, including inserting
-- a new workspace override. A fresh installation has no open evidence window.
create table private.usage_admission_controls (
  scope_key text primary key,
  killed boolean not null default true,
  generation bigint not null default 1 check (generation > 0),
  stop_proof text,
  security_ack text,
  reconciled_until timestamptz,
  net_revenue numeric(20,6),
  variable_cost numeric(20,6) check (variable_cost >= 0),
  updated_at timestamptz not null default now()
);
alter table private.usage_admission_controls enable row level security;
revoke all on private.usage_admission_controls from public, anon, authenticated, service_role;
insert into private.usage_admission_controls(scope_key) values ('global');

create function private.check_usage_admission() returns trigger
language plpgsql security invoker set search_path = pg_catalog, pg_temp as $$
declare
  control private.usage_admission_controls;
  scope text;
begin
  foreach scope in array array['global', 'meter/' || new.meter,
      'workspace/' || new.ws_id::text || '/' || new.meter] loop
    select * into control from private.usage_admission_controls where scope_key = scope for share;
    if not found or control.killed or nullif(trim(control.stop_proof),'') is null
      or nullif(trim(control.security_ack),'') is null
      or control.reconciled_until is null or control.reconciled_until < new.deadline
      or control.net_revenue is null or control.net_revenue <= 0
      or control.variable_cost is null or control.variable_cost > control.net_revenue * 0.4 then
      raise exception 'Commercial admission fenced';
    end if;
  end loop;
  return new;
end $$;
revoke all on function private.check_usage_admission() from public, anon, authenticated, service_role;
create trigger usage_admission_fence before insert on private.usage_holds
for each row execute function private.check_usage_admission();
