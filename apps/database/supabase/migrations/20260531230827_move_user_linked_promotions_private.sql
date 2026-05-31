begin;

alter table if exists public.user_linked_promotions
  set schema private;

alter function public.auto_link_referral_promotion()
  set schema private;

alter function public.fn_prevent_invalid_referral_link()
  set schema private;

alter function public.fn_prevent_owner_referral_unlink()
  set schema private;

create or replace function private.auto_link_referral_promotion()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
begin
  insert into private.user_linked_promotions (user_id, promo_id)
  values (new.owner_id, new.id);

  return new;
end;
$function$;

create or replace function private.fn_prevent_invalid_referral_link()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  promo record;
begin
  select *
  into promo
  from public.workspace_promotions
  where id = new.promo_id;

  if promo.promo_type = 'REFERRAL'
    and promo.owner_id is distinct from new.user_id then
    raise exception 'Referral promotions can only be linked to their owner.';
  end if;

  return new;
end;
$function$;

create or replace function private.fn_prevent_owner_referral_unlink()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  promo record;
begin
  select *
  into promo
  from public.workspace_promotions
  where id = old.promo_id;

  if promo.promo_type = 'REFERRAL'
    and promo.owner_id = old.user_id then
    raise exception 'You cannot unlink your own referral promotion.';
  end if;

  return old;
end;
$function$;

drop trigger if exists t_auto_link_referral_promo
  on public.workspace_promotions;

create trigger t_auto_link_referral_promo
after insert on public.workspace_promotions
for each row
when (
  new.promo_type = 'REFERRAL'::promotion_type
  and new.owner_id is not null
)
execute function private.auto_link_referral_promotion();

drop trigger if exists t_prevent_invalid_referral_link
  on private.user_linked_promotions;

create trigger t_prevent_invalid_referral_link
before insert on private.user_linked_promotions
for each row
execute function private.fn_prevent_invalid_referral_link();

drop trigger if exists t_prevent_owner_referral_unlink
  on private.user_linked_promotions;

create trigger t_prevent_owner_referral_unlink
before delete on private.user_linked_promotions
for each row
execute function private.fn_prevent_owner_referral_unlink();

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'private'
      and tablename = 'user_linked_promotions'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

alter table private.user_linked_promotions enable row level security;

revoke all on table private.user_linked_promotions from anon, authenticated, public;

grant all on table private.user_linked_promotions to service_role;

create policy "Service role can manage private user linked promotions"
on private.user_linked_promotions
for all
to service_role
using (true)
with check (true);

revoke all on function private.auto_link_referral_promotion()
  from anon, authenticated, public;
revoke all on function private.fn_prevent_invalid_referral_link()
  from anon, authenticated, public;
revoke all on function private.fn_prevent_owner_referral_unlink()
  from anon, authenticated, public;

grant execute on function private.auto_link_referral_promotion()
  to service_role;
grant execute on function private.fn_prevent_invalid_referral_link()
  to service_role;
grant execute on function private.fn_prevent_owner_referral_unlink()
  to service_role;

notify pgrst, 'reload schema';

commit;
