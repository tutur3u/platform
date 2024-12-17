create table "public"."calendar_event_platform_participants" (
    "event_id" uuid not null,
    "user_id" uuid not null,
    "going" boolean default null,
    "role" text,
    "notes" text not null default ''::text,
    "created_at" timestamp with time zone default now()
);
alter table "public"."calendar_event_platform_participants" enable row level security;
create table "public"."calendar_event_virtual_participants" (
    "event_id" uuid not null,
    "user_id" uuid not null,
    "going" boolean default null,
    "role" text,
    "notes" text not null default ''::text,
    "created_at" timestamp with time zone default now()
);
alter table "public"."calendar_event_virtual_participants" enable row level security;
CREATE UNIQUE INDEX calendar_event_platform_participants_pkey ON public.calendar_event_platform_participants USING btree (event_id, user_id);
CREATE UNIQUE INDEX calendar_event_virtual_participants_pkey ON public.calendar_event_virtual_participants USING btree (event_id, user_id);
alter table "public"."calendar_event_platform_participants"
add constraint "calendar_event_platform_participants_pkey" PRIMARY KEY using index "calendar_event_platform_participants_pkey";
alter table "public"."calendar_event_virtual_participants"
add constraint "calendar_event_virtual_participants_pkey" PRIMARY KEY using index "calendar_event_virtual_participants_pkey";
alter table "public"."calendar_event_platform_participants"
add constraint "calendar_event_platform_participants_event_id_fkey" FOREIGN KEY (event_id) REFERENCES workspace_calendar_events(id) ON DELETE CASCADE not valid;
alter table "public"."calendar_event_platform_participants" validate constraint "calendar_event_platform_participants_event_id_fkey";
alter table "public"."calendar_event_platform_participants"
add constraint "calendar_event_platform_participants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;
alter table "public"."calendar_event_platform_participants" validate constraint "calendar_event_platform_participants_user_id_fkey";
alter table "public"."calendar_event_virtual_participants"
add constraint "calendar_event_virtual_participants_event_id_fkey" FOREIGN KEY (event_id) REFERENCES workspace_calendar_events(id) ON DELETE CASCADE not valid;
alter table "public"."calendar_event_virtual_participants" validate constraint "calendar_event_virtual_participants_event_id_fkey";
alter table "public"."calendar_event_virtual_participants"
add constraint "calendar_event_virtual_participants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES workspace_users(id) ON DELETE CASCADE not valid;
alter table "public"."calendar_event_virtual_participants" validate constraint "calendar_event_virtual_participants_user_id_fkey";
create policy "Allow delete for workspace users and the participant" on "public"."calendar_event_platform_participants" as permissive for delete to authenticated using (
    (
        (user_id = auth.uid())
        OR (
            EXISTS (
                SELECT 1
                FROM workspace_calendar_events e,
                    workspace_members m
                WHERE (
                        (
                            e.id = calendar_event_platform_participants.event_id
                        )
                        AND (m.user_id = m.user_id)
                        AND (m.ws_id = e.ws_id)
                    )
            )
        )
    )
);
create policy "Allow insert for workspace users" on "public"."calendar_event_platform_participants" as permissive for
insert to authenticated with check (
        (
            EXISTS (
                SELECT 1
                FROM workspace_calendar_events e,
                    workspace_members m
                WHERE (
                        (
                            e.id = calendar_event_platform_participants.event_id
                        )
                        AND (m.user_id = m.user_id)
                        AND (m.ws_id = e.ws_id)
                    )
            )
        )
    );
create policy "Allow select for workspace users and the participant" on "public"."calendar_event_platform_participants" as permissive for
select to authenticated using (
        (
            (user_id = auth.uid())
            OR (
                EXISTS (
                    SELECT 1
                    FROM workspace_calendar_events e,
                        workspace_members m
                    WHERE (
                            (
                                e.id = calendar_event_platform_participants.event_id
                            )
                            AND (m.user_id = m.user_id)
                            AND (m.ws_id = e.ws_id)
                        )
                )
            )
        )
    );
create policy "Allow update for workspace users and the participant" on "public"."calendar_event_platform_participants" as permissive for
update to authenticated using (
        (
            (user_id = auth.uid())
            OR (
                EXISTS (
                    SELECT 1
                    FROM workspace_calendar_events e,
                        workspace_members m
                    WHERE (
                            (
                                e.id = calendar_event_platform_participants.event_id
                            )
                            AND (m.user_id = m.user_id)
                            AND (m.ws_id = e.ws_id)
                        )
                )
            )
        )
    ) with check (
        (
            (user_id = auth.uid())
            OR (
                EXISTS (
                    SELECT 1
                    FROM workspace_calendar_events e,
                        workspace_members m
                    WHERE (
                            (
                                e.id = calendar_event_platform_participants.event_id
                            )
                            AND (m.user_id = m.user_id)
                            AND (m.ws_id = e.ws_id)
                        )
                )
            )
        )
    );
create policy "Allow access for workspace users" on "public"."calendar_event_virtual_participants" as permissive for all to authenticated using (
    (
        (
            EXISTS (
                SELECT 1
                FROM workspace_calendar_events e
                WHERE (
                        e.id = calendar_event_virtual_participants.event_id
                    )
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM workspace_users u
                WHERE (
                        u.id = calendar_event_virtual_participants.user_id
                    )
            )
        )
    )
) with check (
    (
        (
            EXISTS (
                SELECT 1
                FROM workspace_calendar_events e
                WHERE (
                        e.id = calendar_event_virtual_participants.event_id
                    )
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM workspace_users u
                WHERE (
                        u.id = calendar_event_virtual_participants.user_id
                    )
            )
        )
    )
);
-- Add a view called "calendar_event_participants" that unions the two tables and adds a "type" column, which is either "platform" or "virtual"
create view "public"."calendar_event_participants" as
select event_id,
    user_id,
    p.going,
    u.display_name,
    u.handle,
    'platform'::text as type,
    p.created_at
from calendar_event_platform_participants p
    join users u on u.id = p.user_id
union
select event_id,
    user_id,
    p.going,
    u.name as display_name,
    coalesce(u.phone, u.email) as handle,
    'virtual'::text as type,
    p.created_at
from calendar_event_virtual_participants p
    join workspace_users u on u.id = p.user_id;
select audit.enable_tracking(
        'public.calendar_event_platform_participants'::regclass
    );
select audit.enable_tracking(
        'public.calendar_event_virtual_participants'::regclass
    );
CREATE OR REPLACE FUNCTION audit.get_ws_id(table_name TEXT, record JSONB) RETURNS UUID LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE COST 100 AS $$ BEGIN IF table_name = 'workspaces' THEN RETURN (record->>'id')::UUID;
END IF;
IF table_name = 'wallet_transactions' THEN RETURN (
    SELECT ws_id
    FROM public.workspace_wallets
    WHERE id = (record->>'wallet_id')::UUID
);
END IF;
IF table_name = 'calendar_event_platform_participants'
OR table_name = 'calendar_event_virtual_participants' THEN RETURN (
    SELECT ws_id
    FROM public.workspace_calendar_events
    WHERE id = (record->>'event_id')::UUID
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
        WHERE (
                wm.ws_id = audit.get_ws_id(audit_log.table_name, audit_log.record)
                OR wm.ws_id = audit.get_ws_id(audit_log.table_name, audit_log.old_record)
            )
            AND (
                auth.uid() IS NULL
                OR wm.user_id = auth.uid()
            )
    )
ORDER BY audit_log.ts DESC;