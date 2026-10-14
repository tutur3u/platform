-- Normalize the recipient once before every managed identity lookup.
-- Replacement preserves the existing owner, ACL, result and read-only behavior.
create or replace function private.employee_inbound_mailbox(p_email text,p_domain_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  canonical_email text := lower(btrim(p_email));
  employee private.infrastructure_employees%rowtype;
  mailbox private.mail_mailboxes%rowtype;
begin
  select * into employee from private.infrastructure_employees where staff_email=canonical_email;
  if not found then
    -- A retained preflight intent reserves inbound routing before Auth INSERT.
    if exists(select 1 from private.employee_creation_intents where staff_email=canonical_email) then
      return jsonb_build_object('managed',true,'mailbox',null);
    end if;
    return jsonb_build_object('managed',false);
  end if;
  if employee.lifecycle_state<>'active' or not exists(select 1 from auth.users where id=employee.user_id
    and email=canonical_email and email_confirmed_at is not null
    and raw_app_meta_data->'employee_onboarding'='true'::jsonb
    and (banned_until is null or banned_until<=now())) then
    return jsonb_build_object('managed',true,'mailbox',null);
  end if;
  select * into mailbox from private.mail_mailboxes where id=employee.mailbox_id and address=canonical_email
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
