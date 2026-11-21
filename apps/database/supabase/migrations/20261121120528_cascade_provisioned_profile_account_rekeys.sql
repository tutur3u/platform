-- Keep the provisioned profile attached to its account across an authorized
-- platform user ID change, with the same cleanup on account deletion.
alter table private.contact_account_provisioned_profiles
  drop constraint contact_account_provisioned_profiles_account_id_fkey,
  add constraint contact_account_provisioned_profiles_account_id_fkey
    foreign key (account_id) references public.users (id)
    on update cascade on delete cascade;
