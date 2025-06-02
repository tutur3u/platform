alter table "public"."extensions" drop constraint "extensions_tenant_external_id_fkey";
alter table "public"."extensions" drop constraint "extensions_pkey";
alter table "public"."tenants" drop constraint "tenants_pkey";
drop index if exists "public"."extensions_pkey";
drop index if exists "public"."extensions_tenant_external_id_type_index";
drop index if exists "public"."tenants_external_id_index";
drop index if exists "public"."tenants_pkey";
drop table "public"."extensions";
drop table "public"."tenants";
drop policy "Enable read access for related users or workspace users" on "audit"."record_version";
ALTER TABLE audit.record_version DROP COLUMN IF EXISTS ws_id;
-- Add a function that gets the workspace id from a record/old_record
CREATE OR REPLACE FUNCTION audit.get_ws_id(table_name TEXT, record JSONB) RETURNS UUID LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE COST 100 AS $$ BEGIN IF table_name = 'workspaces' THEN RETURN (record->>'id')::UUID;
END IF;
IF table_name = 'wallet_transactions' THEN RETURN (
    SELECT ws_id
    FROM public.workspace_wallets
    WHERE id = (record->>'wallet_id')::UUID
);
END IF;
RETURN (record->>'ws_id')::UUID;
END;
$$;
CREATE OR REPLACE VIEW public.audit_logs AS
SELECT audit_log.id,
    audit_log.table_name,
    audit_log.record_id,
    audit_log.old_record_id,
    audit_log.op,
    audit_log.ts,
    audit_log.record,
    audit_log.old_record,
    audit_log.auth_role,
    audit_log.auth_uid,
    coalesce(
        audit.get_ws_id(audit_log.table_name, audit_log.record),
        audit.get_ws_id(audit_log.table_name, audit_log.old_record)
    ) AS ws_id
FROM audit.record_version AS audit_log
WHERE EXISTS (
        SELECT 1
        FROM workspace_members wm
        WHERE audit.get_ws_id(audit_log.table_name, audit_log.record) IS NOT NULL
            AND (
                wm.ws_id = audit.get_ws_id(audit_log.table_name, audit_log.record)
                OR wm.ws_id = audit.get_ws_id(audit_log.table_name, audit_log.old_record)
            )
            AND (
                auth.uid() IS NULL
                OR wm.user_id = auth.uid()
            )
    )
ORDER BY audit_log.ts DESC;