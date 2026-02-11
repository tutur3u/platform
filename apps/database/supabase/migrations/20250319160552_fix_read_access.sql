drop policy "Enable read access for normal users" on "public"."nova_challenges";

drop policy "Enable read access for normal users" on "public"."nova_problems";

create policy "Enable read access for normal users"
on "public"."nova_challenges"
as permissive
for select
to authenticated
using (((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.enabled = true)))) AND (enabled = true) AND ((previewable_at IS NULL) OR (previewable_at <= now())) AND ((close_at IS NULL) OR (now() < close_at))));


create policy "Enable read access for normal users"
on "public"."nova_problems"
as permissive
for select
to authenticated
using (((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.enabled = true)))) AND (EXISTS ( SELECT 1
   FROM nova_challenges nc
  WHERE ((nc.id = nova_problems.challenge_id) AND ((nc.open_at IS NULL) OR (nc.open_at <= now())) AND ((nc.close_at IS NULL) OR (now() < nc.close_at)))))));



