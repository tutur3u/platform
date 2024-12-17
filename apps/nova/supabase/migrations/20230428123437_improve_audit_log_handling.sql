alter table audit.record_version
alter column auth_uid
set default auth.uid();
ALTER TABLE audit.record_version DROP COLUMN IF EXISTS ws_id;
ALTER TABLE audit.record_version
ADD COLUMN ws_id uuid GENERATED ALWAYS AS (
        (
            CASE
                WHEN table_name = 'workspaces' THEN CASE
                    WHEN record ? 'id' THEN (record->>'id')::uuid
                    WHEN old_record ? 'id' THEN (old_record->>'id')::uuid
                    ELSE NULL
                END
                ELSE CASE
                    WHEN record ? 'ws_id' THEN (record->>'ws_id')::uuid
                    WHEN old_record ? 'ws_id' THEN (old_record->>'ws_id')::uuid
                    ELSE NULL
                END
            END
        )
    ) STORED;
drop policy "Enable read access for related users or workspace users" on "audit"."record_version";
create policy "Enable read access for related users or workspace users" on "audit"."record_version" as permissive for
select to authenticated using (
        (
            (auth_uid = auth.uid())
            OR (
                EXISTS (
                    SELECT 1
                    FROM workspace_members m
                    WHERE (m.user_id = record_version.auth_uid)
                )
            )
            OR (
                EXISTS (
                    SELECT 1
                    FROM workspaces w
                    WHERE (w.id = record_version.ws_id)
                )
            )
        )
    );