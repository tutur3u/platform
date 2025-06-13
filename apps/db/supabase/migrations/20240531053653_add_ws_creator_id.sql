drop policy "Enable insert for authenticated users only" on "public"."workspaces";

drop policy "Enable read access for organization members or invited members" on "public"."workspaces";

drop policy "Enable update for all organization members" on "public"."workspaces";

alter table "public"."workspaces" add column "creator_id" uuid default auth.uid();

alter table "public"."workspaces" add constraint "workspaces_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE not valid;

alter table "public"."workspaces" validate constraint "workspaces_creator_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.add_ws_creator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$BEGIN
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.workspace_members(ws_id, user_id, role)
    VALUES (new.id, auth.uid(), 'OWNER');
  END IF;
  RETURN new;
END;$function$
;

create policy "Enable insert for authenticated users only"
on "public"."workspaces"
as permissive
for insert
to authenticated
with check ((creator_id = auth.uid()));


create policy "Enable read access for organization members or invited members"
on "public"."workspaces"
as permissive
for select
to authenticated
using ((is_org_member(auth.uid(), id) OR is_member_invited(auth.uid(), id) OR (EXISTS ( SELECT 1
   FROM workspace_email_invites wei
  WHERE (wei.email = auth.email()))) OR (creator_id = auth.uid())));


create policy "Enable update for all organization members"
on "public"."workspaces"
as permissive
for update
to authenticated
using (((id <> '00000000-0000-0000-0000-000000000000'::uuid) AND ((get_user_role(auth.uid(), id) = 'OWNER'::text) OR (get_user_role(auth.uid(), id) = 'ADMIN'::text))))
with check (((id <> '00000000-0000-0000-0000-000000000000'::uuid) AND ((get_user_role(auth.uid(), id) = 'OWNER'::text) OR (get_user_role(auth.uid(), id) = 'ADMIN'::text))));



