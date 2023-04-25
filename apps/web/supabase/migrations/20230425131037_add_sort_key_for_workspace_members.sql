alter table "public"."workspace_members"
add column "sort_key" smallint;
-- Make the ws_id, user_id and sort_key a unique key
alter table "public"."workspace_members"
add constraint "workspace_members_ws_id_user_id_sort_key_key" unique ("ws_id", "user_id", "sort_key");
drop policy "Enable insert for invited members" on "public"."workspace_members";
create policy "Allow update for workspace members" on "public"."workspace_members" as permissive for
update to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "Enable insert for invited members or workspace members" on "public"."workspace_members" as permissive for
insert to authenticated with check (
        (
            is_member_invited(auth.uid(), ws_id)
            OR is_org_member(auth.uid(), ws_id)
        )
    );