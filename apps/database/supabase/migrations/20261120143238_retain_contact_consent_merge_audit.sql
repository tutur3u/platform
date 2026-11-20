alter table private.contact_account_link_audit
  add column merge_result jsonb;

-- Phased HTTP merges can stop after the first batch. Clear starter provenance
-- before any batch moves records into the target.
create function private.clear_phased_contact_merge_provenance(
  p_ws_id uuid, p_source_id uuid, p_target_id uuid, p_actor_id uuid
) returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_source_id is not distinct from p_target_id
    or not coalesce(public.has_workspace_permission(p_ws_id, p_actor_id, 'delete_users'), false)
    or not coalesce(public.has_workspace_permission(p_ws_id, p_actor_id, 'update_users'), false)
    or not exists (
      select 1 from public.workspace_users where ws_id = p_ws_id and id = p_source_id
    )
  then
    raise exception 'Invalid or unauthorized merge' using errcode = '42501';
  end if;

  perform 1 from public.workspace_users
    where ws_id = p_ws_id and id = p_target_id for update;
  if not found then
    raise exception 'Invalid or unauthorized merge' using errcode = '42501';
  end if;

  delete from private.contact_account_provisioned_profiles
  where ws_id = p_ws_id and profile_id = p_target_id;
end;
$$;

revoke all on function private.clear_phased_contact_merge_provenance(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.clear_phased_contact_merge_provenance(uuid, uuid, uuid, uuid)
  to service_role;

-- Atomic and phased SQL merges both run fee-lock finalization before removing
-- the source profile. Invalidate the retained profile in the same transaction.
CREATE OR REPLACE FUNCTION private.fee_lock_merge_students(_source_id UUID, _target_id UUID, _ws_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_months TEXT;
  v_moved INTEGER;
BEGIN
  SELECT string_agg(to_char(s.period_month, 'YYYY-MM'), ', ' ORDER BY s.period_month) INTO v_months
  FROM public.fee_locks s
  JOIN public.fee_locks t ON t.ws_id = s.ws_id AND t.period_month = s.period_month AND t.student_id = _target_id
  WHERE s.ws_id = _ws_id AND s.student_id = _source_id;
  IF v_months IS NOT NULL THEN
    RAISE EXCEPTION 'FEE_LOCK_MERGE_CONFLICT' USING ERRCODE = '23505',
      DETAIL = 'Both users have a fee lock for: ' || v_months, HINT = 'Resolve these fee locks before merging.';
  END IF;
  UPDATE public.fee_locks SET student_id = _target_id, version = version + 1, updated_at = now()
  WHERE ws_id = _ws_id AND student_id = _source_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  DELETE FROM private.contact_account_provisioned_profiles
  WHERE ws_id = _ws_id AND profile_id = _target_id;
  RETURN v_moved;
END;
$$;

-- tuturuuu: no-grant (internal)
REVOKE ALL ON FUNCTION private.fee_lock_merge_students(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;

create or replace function private.confirm_contact_account_link(
  p_ws_id uuid, p_contact_id uuid, p_invitation_id uuid, p_actor_id uuid
) returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_invitation private.contact_account_link_invitations%rowtype;
  v_outcome text := 'confirmation_required';
  v_merge_result jsonb;
begin
  -- Use the same contact-then-invitation lock order on every write path.
  perform 1 from public.workspace_users
  where id = p_contact_id and ws_id = p_ws_id for update;
  if found then
    select * into v_invitation
    from private.contact_account_link_invitations
    where id = p_invitation_id and ws_id = p_ws_id
      and contact_id = p_contact_id and account_id = p_actor_id
      and expires_at > statement_timestamp() and consumed_at is null
    for update;
  end if;

  if v_invitation.id is not null then
    v_outcome := 'ineligible';
    perform 1 from public.workspace_members
    where ws_id = p_ws_id and user_id = p_actor_id for share;
    if found and exists (
      select 1 from public.workspace_members
      where ws_id = p_ws_id and user_id = v_invitation.invited_by
    ) and (
      public.has_workspace_permission(p_ws_id, v_invitation.invited_by, 'update_users')
      and public.has_workspace_permission(p_ws_id, v_invitation.invited_by, 'view_users_private_info')
      and public.has_workspace_permission(p_ws_id, v_invitation.invited_by, 'view_users_public_info')
    ) and not exists (
      select 1 from public.workspace_user_linked_users
      where ws_id = p_ws_id and virtual_user_id = p_contact_id
    ) then
      if v_invitation.replacement_profile_id is null then
        insert into public.workspace_user_linked_users
          (ws_id, virtual_user_id, platform_user_id)
        values (p_ws_id, p_contact_id, p_actor_id)
        on conflict (platform_user_id, ws_id) do nothing;
        if found then v_outcome := 'linked'; end if;
      else
        perform 1
        from public.workspace_users source
        join public.workspace_user_linked_users links
          on links.virtual_user_id = source.id and links.ws_id = source.ws_id
        join private.contact_account_provisioned_profiles provisioned
          on provisioned.ws_id = links.ws_id
          and provisioned.account_id = links.platform_user_id
          and provisioned.profile_id = links.virtual_user_id
        where source.ws_id = p_ws_id
          and source.id = v_invitation.replacement_profile_id
          and links.platform_user_id = p_actor_id
        for update of source, links, provisioned;

        if found then
          v_merge_result := private.merge_workspace_users_for_actor(
            v_invitation.replacement_profile_id, p_contact_id, p_ws_id,
            v_invitation.invited_by
          );
          if (v_merge_result->>'success')::boolean then
            if not exists (
              select 1 from public.workspace_user_linked_users
              where ws_id = p_ws_id and virtual_user_id = p_contact_id
                and platform_user_id = p_actor_id
            ) then
              raise exception 'Consented contact merge did not transfer the account';
            end if;
            v_outcome := 'linked';
          end if;
        end if;
      end if;
    end if;

    update private.contact_account_link_invitations
    set consumed_at = statement_timestamp() where id = v_invitation.id;
  end if;

  insert into private.contact_account_link_audit
    (ws_id, contact_id, actor_id, outcome, invitation_id, account_id, invited_by, merge_result)
  values (p_ws_id, p_contact_id, p_actor_id, v_outcome,
    v_invitation.id, v_invitation.account_id, v_invitation.invited_by,
    case when v_outcome = 'linked' then v_merge_result end);
  return v_outcome;
end;
$$;

revoke all on function private.confirm_contact_account_link(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.confirm_contact_account_link(uuid, uuid, uuid, uuid)
  to service_role;
