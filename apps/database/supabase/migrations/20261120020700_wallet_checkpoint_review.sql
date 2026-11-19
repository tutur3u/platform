alter table private.workspace_wallet_checkpoints
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.users (id) on delete set null;

-- Both columns inherit the checkpoint table's service-only RLS boundary.
-- The setter checks the verified workspace actor again inside the write.
create function private.invalidate_wallet_checkpoint_review()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if (new.wallet_id, new.checked_at, new.actual_balance)
     is distinct from (old.wallet_id, old.checked_at, old.actual_balance) then
    new.reviewed_at := null;
    new.reviewed_by := null;
  end if;
  return new;
end;
$$;

revoke all on function private.invalidate_wallet_checkpoint_review()
  from public, anon, authenticated;

create trigger invalidate_wallet_checkpoint_review
  before update of wallet_id, checked_at, actual_balance
  on private.workspace_wallet_checkpoints
  for each row execute function private.invalidate_wallet_checkpoint_review();

create function private.set_wallet_checkpoint_review(
  _ws_id uuid,
  _wallet_id uuid,
  _checkpoint_id uuid,
  _actor_id uuid,
  _expected_updated_at timestamptz,
  _reviewed boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  checkpoint private.workspace_wallet_checkpoints%rowtype;
begin
  if not exists (
    select 1 from public.workspace_members
    where ws_id = _ws_id and user_id = _actor_id
  ) or public.has_workspace_permission(
    _ws_id, _actor_id, 'view_transactions'
  ) is distinct from true
    or public.has_workspace_permission(
      _ws_id, _actor_id, 'update_wallets'
    ) is distinct from true then
    return null;
  end if;

  select c.* into checkpoint
  from private.workspace_wallet_checkpoints c
  join private.workspace_wallets w on w.id = c.wallet_id
  where w.ws_id = _ws_id and c.wallet_id = _wallet_id and c.id = _checkpoint_id
    and (
      public.has_workspace_permission(_ws_id, _actor_id, 'manage_finance')
      or exists (
        select 1
        from public.workspace_role_wallet_whitelist ww
        join public.workspace_roles r on r.id = ww.role_id and r.ws_id = _ws_id
        join public.workspace_role_members m
          on m.role_id = r.id and m.user_id = _actor_id
        where ww.wallet_id = c.wallet_id
          and c.checked_at >= statement_timestamp() -
            make_interval(secs => 86400.0 * public.get_wallet_viewing_window_days(
              ww.viewing_window, ww.custom_days
            ))
      )
    )
  for update of c;

  if not found then
    return null;
  end if;

  if checkpoint.updated_at is distinct from _expected_updated_at then
    raise sqlstate 'PT409' using message = 'Checkpoint changed';
  end if;

  if (checkpoint.reviewed_at is not null) is distinct from _reviewed then
    update private.workspace_wallet_checkpoints
    set reviewed_at = case when _reviewed then statement_timestamp() end,
        reviewed_by = case when _reviewed then _actor_id end
    where id = checkpoint.id
    returning * into checkpoint;
  end if;

  return jsonb_build_object(
    'reviewed_at', checkpoint.reviewed_at,
    'updated_at', checkpoint.updated_at
  );
end;
$$;

revoke all on function private.set_wallet_checkpoint_review(
  uuid, uuid, uuid, uuid, timestamptz, boolean
) from public, anon, authenticated;

grant execute on function private.set_wallet_checkpoint_review(
  uuid, uuid, uuid, uuid, timestamptz, boolean
) to service_role;
