-- Provision profiles and exact mailbox transactionally; Auth activation stays
-- on the supported provider API until an actual schema review proves otherwise.
create function private.finalize_employee_creation(p_actor_id uuid,p_user_id uuid,p_email text,p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  employee private.infrastructure_employees%rowtype;
  target auth.users%rowtype;
  domain_id uuid;
  mailbox private.mail_mailboxes%rowtype;
begin
  perform private.lock_employee_auth_pair(p_actor_id,p_user_id);
  perform private.assert_employee_administrator(p_actor_id);
  select * into target from auth.users where id=p_user_id for update;
  if not found or target.email is distinct from p_email or target.email_confirmed_at is null
    or target.raw_app_meta_data->'employee_onboarding' is distinct from 'true'::jsonb
    or target.banned_until is null or target.banned_until <= now() then
    raise exception using errcode='23514',message='Employee must remain pending';
  end if;
  select * into employee from private.infrastructure_employees where user_id=p_user_id for update;
  if not found or employee.staff_email is distinct from p_email or employee.managed_name is distinct from p_name
    or employee.lifecycle_state <> 'pending' then
    raise exception using errcode='23514',message='Employee creation does not match pending identity';
  end if;
  if not exists(select 1 from public.platform_user_roles where user_id=p_user_id and not enabled
    and not allow_challenge_management and not allow_manage_all_challenges and not allow_role_management) then
    raise exception using errcode='23514',message='Employee inherited unexpected grants';
  end if;
  select id into domain_id from private.mail_domains where domain='tuturuuu.com' and status='active' for update;
  if not found then raise exception using errcode='23505',message='Employee mail domain is unavailable'; end if;
  select * into mailbox from private.mail_mailboxes where address=p_email for update;
  if found then
    if mailbox.domain_id<>domain_id or mailbox.type<>'personal' or mailbox.status<>'active'
      or mailbox.created_by is distinct from p_user_id
      or not exists(select 1 from private.mail_mailbox_members where mailbox_id=mailbox.id and user_id=p_user_id and role='owner')
      or exists(select 1 from private.mail_mailbox_members where mailbox_id=mailbox.id and user_id<>p_user_id) then
      raise exception using errcode='23505',message='Employee mailbox is unavailable';
    end if;
  else
    insert into private.mail_mailboxes(address,domain_id,type,status,display_name,sender_name,created_by)
      values(p_email,domain_id,'personal','active',p_name,p_name,p_user_id) returning * into mailbox;
    insert into private.mail_mailbox_members(mailbox_id,user_id,role,created_by)
      values(mailbox.id,p_user_id,'owner',p_actor_id);
  end if;
  update private.mail_mailboxes set display_name=p_name,sender_name=p_name where id=mailbox.id;
  update public.users set display_name=p_name where id=p_user_id;
  if not found then raise exception using errcode='23514',message='Employee profile is missing'; end if;
  update public.user_private_details set full_name=p_name where user_id=p_user_id;
  if not found then raise exception using errcode='23514',message='Employee private profile is missing'; end if;
  update private.infrastructure_employees set lifecycle_state='provisioned',mailbox_id=mailbox.id,
    created_by=p_actor_id,updated_by=p_actor_id,updated_at=now() where user_id=p_user_id;
  return jsonb_build_object('id',p_user_id,'email',p_email,'displayName',p_name,'status','pending');
end;
$$;

create function private.confirm_employee_activation(p_actor_id uuid,p_user_id uuid,p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare employee private.infrastructure_employees%rowtype;
begin
  perform private.lock_employee_auth_pair(p_actor_id,p_user_id);
  perform private.assert_employee_administrator(p_actor_id);
  perform 1 from auth.users where id=p_user_id and email=p_email and email_confirmed_at is not null
    and raw_app_meta_data->'employee_onboarding'='true'::jsonb and (banned_until is null or banned_until <= now()) for update;
  if not found then raise exception using errcode='23514',message='Employee activation is not confirmed'; end if;
  select * into employee from private.infrastructure_employees where user_id=p_user_id for update;
  if not found or employee.staff_email<>p_email or employee.lifecycle_state<>'provisioned' then
    raise exception using errcode='23514',message='Employee activation is not confirmed';
  end if;
  if not exists(select 1 from private.mail_mailboxes mb join private.mail_domains d on d.id=mb.domain_id
    where mb.id=employee.mailbox_id and mb.address=p_email and d.domain='tuturuuu.com' and d.status='active'
      and mb.type='personal' and mb.status='active' and mb.created_by=p_user_id
      and mb.display_name=employee.managed_name and mb.sender_name=employee.managed_name
      and exists(select 1 from private.mail_mailbox_members mm where mm.mailbox_id=mb.id and mm.user_id=p_user_id and mm.role='owner')
      and not exists(select 1 from private.mail_mailbox_members mm where mm.mailbox_id=mb.id and mm.user_id<>p_user_id))
    or not exists(select 1 from public.users where id=p_user_id and display_name=employee.managed_name)
    or not exists(select 1 from public.user_private_details where user_id=p_user_id and full_name=employee.managed_name and email=p_email)
    or not exists(select 1 from public.platform_user_roles where user_id=p_user_id and not enabled
      and not allow_challenge_management and not allow_manage_all_challenges and not allow_role_management) then
    raise exception using errcode='23514',message='Employee activation is not confirmed';
  end if;
  update private.infrastructure_employees set lifecycle_state='active',updated_by=p_actor_id,updated_at=now() where user_id=p_user_id;
  return jsonb_build_object('id',p_user_id,'email',p_email,'displayName',employee.managed_name,'status','created');
end;
$$;
revoke all on function private.finalize_employee_creation(uuid,uuid,text,text),private.confirm_employee_activation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.finalize_employee_creation(uuid,uuid,text,text),private.confirm_employee_activation(uuid,uuid,text) to service_role;

-- Inbound delivery never routes a managed pending/conflicting recipient into
-- catch-all, and never provisions a replacement mailbox for that recipient.
create function private.employee_inbound_mailbox(p_email text,p_domain_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare employee private.infrastructure_employees%rowtype; mailbox private.mail_mailboxes%rowtype;
begin
  select * into employee from private.infrastructure_employees where staff_email=p_email;
  if not found then
    -- A retained preflight intent reserves inbound routing before Auth INSERT.
    if exists(select 1 from private.employee_creation_intents where staff_email=p_email) then
      return jsonb_build_object('managed',true,'mailbox',null);
    end if;
    return jsonb_build_object('managed',false);
  end if;
  if employee.lifecycle_state<>'active' or not exists(select 1 from auth.users where id=employee.user_id
    and email=p_email and email_confirmed_at is not null
    and raw_app_meta_data->'employee_onboarding'='true'::jsonb
    and (banned_until is null or banned_until<=now())) then
    return jsonb_build_object('managed',true,'mailbox',null);
  end if;
  select * into mailbox from private.mail_mailboxes where id=employee.mailbox_id and address=p_email
    and domain_id=p_domain_id and type='personal' and status='active' and created_by=employee.user_id
    and display_name=employee.managed_name and sender_name=employee.managed_name;
  if not found or not exists(select 1 from private.mail_domains where id=p_domain_id and domain='tuturuuu.com' and status='active')
    or not exists(select 1 from private.mail_mailbox_members where mailbox_id=mailbox.id and user_id=employee.user_id and role='owner')
    or exists(select 1 from private.mail_mailbox_members where mailbox_id=mailbox.id and user_id<>employee.user_id) then
    return jsonb_build_object('managed',true,'mailbox',null);
  end if;
  return jsonb_build_object('managed',true,'mailbox',to_jsonb(mailbox));
end;
$$;
revoke all on function private.employee_inbound_mailbox(text,uuid) from public,anon,authenticated;
grant execute on function private.employee_inbound_mailbox(text,uuid) to service_role;

-- Ordinary enable cannot bypass pending creation or conflicting mailbox state.
create function private.employee_access_preflight(p_actor_id uuid,p_user_id uuid,p_email text,p_require_active boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare employee private.infrastructure_employees%rowtype;
begin
  perform private.lock_employee_auth_pair(p_actor_id,p_user_id);
  perform private.assert_employee_administrator(p_actor_id);
  perform 1 from auth.users where id=p_user_id and email=p_email and email_confirmed_at is not null
    and raw_app_meta_data->'employee_onboarding'='true'::jsonb
    and (not p_require_active or banned_until is null or banned_until<=now()) for update;
  if not found then raise exception using errcode='23514',message='Employee access is not confirmed'; end if;
  select * into employee from private.infrastructure_employees where user_id=p_user_id for update;
  if not found or employee.staff_email<>p_email or employee.lifecycle_state<>'active'
    or not exists(select 1 from private.mail_mailboxes mb join private.mail_domains d on d.id=mb.domain_id
      where mb.id=employee.mailbox_id and mb.address=p_email and d.domain='tuturuuu.com' and d.status='active'
        and mb.type='personal' and mb.status='active' and mb.created_by=p_user_id
        and mb.display_name=employee.managed_name and mb.sender_name=employee.managed_name
        and exists(select 1 from private.mail_mailbox_members mm where mm.mailbox_id=mb.id and mm.user_id=p_user_id and mm.role='owner')
        and not exists(select 1 from private.mail_mailbox_members mm where mm.mailbox_id=mb.id and mm.user_id<>p_user_id))
    or not exists(select 1 from public.users where id=p_user_id and display_name=employee.managed_name)
    or not exists(select 1 from public.user_private_details where user_id=p_user_id and email=p_email and full_name=employee.managed_name) then
    raise exception using errcode='23514',message='Employee access is not confirmed';
  end if;
  return true;
end;
$$;
revoke all on function private.employee_access_preflight(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function private.employee_access_preflight(uuid,uuid,text,boolean) to service_role;
