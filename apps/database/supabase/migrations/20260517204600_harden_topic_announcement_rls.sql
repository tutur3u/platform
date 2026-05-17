revoke all privileges on table
  public.topic_announcement_contacts,
  public.topic_announcement_contact_verifications,
  public.topic_announcement_batches,
  public.topic_announcements,
  public.topic_announcement_recipients
from public, anon, authenticated;

revoke execute on function public.topic_announcement_contact_has_linked_verified_email(uuid)
from public, anon, authenticated;

drop policy if exists "Allow workspace members to view topic announcement contacts"
  on public.topic_announcement_contacts;
drop policy if exists "Allow workspace members to manage topic announcement contacts"
  on public.topic_announcement_contacts;
drop policy if exists "Allow service role to manage topic announcement contacts"
  on public.topic_announcement_contacts;

create policy "Allow service role to manage topic announcement contacts"
  on public.topic_announcement_contacts
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Allow workspace members to view topic announcement contact verifications"
  on public.topic_announcement_contact_verifications;
drop policy if exists "Allow workspace members to manage topic announcement contact verifications"
  on public.topic_announcement_contact_verifications;
drop policy if exists "Allow service role to manage topic announcement contact verifications"
  on public.topic_announcement_contact_verifications;

create policy "Allow service role to manage topic announcement contact verifications"
  on public.topic_announcement_contact_verifications
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Allow workspace members to view topic announcement batches"
  on public.topic_announcement_batches;
drop policy if exists "Allow workspace members to manage topic announcement batches"
  on public.topic_announcement_batches;
drop policy if exists "Allow service role to manage topic announcement batches"
  on public.topic_announcement_batches;

create policy "Allow service role to manage topic announcement batches"
  on public.topic_announcement_batches
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Allow workspace members to view topic announcements"
  on public.topic_announcements;
drop policy if exists "Allow workspace members to manage topic announcements"
  on public.topic_announcements;
drop policy if exists "Allow service role to manage topic announcements"
  on public.topic_announcements;

create policy "Allow service role to manage topic announcements"
  on public.topic_announcements
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Allow workspace members to view topic announcement recipients"
  on public.topic_announcement_recipients;
drop policy if exists "Allow workspace members to manage topic announcement recipients"
  on public.topic_announcement_recipients;
drop policy if exists "Allow service role to manage topic announcement recipients"
  on public.topic_announcement_recipients;

create policy "Allow service role to manage topic announcement recipients"
  on public.topic_announcement_recipients
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

grant all privileges on table
  public.topic_announcement_contacts,
  public.topic_announcement_contact_verifications,
  public.topic_announcement_batches,
  public.topic_announcements,
  public.topic_announcement_recipients
to service_role;
grant execute on function public.topic_announcement_contact_has_linked_verified_email(uuid)
to service_role;
