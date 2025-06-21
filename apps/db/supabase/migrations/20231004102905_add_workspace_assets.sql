alter table "public"."workspaces"
add column "avatar_url" text;
alter table "public"."workspaces"
add column "logo_url" text;
create policy "Allow workspace members to delete items workspace folder" on "storage"."objects" as permissive for delete to authenticated using (
    (
        (bucket_id = 'workspaces'::text)
        AND is_org_member(
            auth.uid(),
            ((storage.foldername(name)) [1])::uuid
        )
    )
);
create policy "Allow workspace members to update items in workspace folder" on "storage"."objects" as permissive for
update to authenticated using (
        (
            (bucket_id = 'workspaces'::text)
            AND is_org_member(
                auth.uid(),
                ((storage.foldername(name)) [1])::uuid
            )
        )
    ) with check (
        (
            (bucket_id = 'workspaces'::text)
            AND is_org_member(
                auth.uid(),
                ((storage.foldername(name)) [1])::uuid
            )
        )
    );
create policy "Allow workspace members to upload to workspace folder" on "storage"."objects" as permissive for
insert to authenticated with check (
        (
            (bucket_id = 'workspaces'::text)
            AND is_org_member(
                auth.uid(),
                ((storage.foldername(name)) [1])::uuid
            )
        )
    );
create policy "Allow workspace members to view workspace folder" on "storage"."objects" as permissive for
select to authenticated using (
        (
            (bucket_id = 'workspaces'::text)
            AND is_org_member(
                auth.uid(),
                ((storage.foldername(name)) [1])::uuid
            )
        )
    );