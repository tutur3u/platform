drop policy "Allow delete for workspace users and the participant" on "public"."calendar_event_platform_participants";
drop policy "Allow insert for workspace users" on "public"."calendar_event_platform_participants";
drop policy "Allow select for workspace users and the participant" on "public"."calendar_event_platform_participants";
drop policy "Allow update for workspace users and the participant" on "public"."calendar_event_platform_participants";
drop view if exists "public"."calendar_event_participants";
create table "public"."calendar_event_participant_groups" (
  "event_id" uuid not null,
  "group_id" uuid not null,
  "role" text default ''::text,
  "notes" text default ''::text,
  "created_at" timestamp with time zone default now()
);
alter table "public"."calendar_event_participant_groups" enable row level security;
CREATE UNIQUE INDEX calendar_event_participant_groups_pkey ON public.calendar_event_participant_groups USING btree (event_id, group_id);
alter table "public"."calendar_event_participant_groups"
add constraint "calendar_event_participant_groups_pkey" PRIMARY KEY using index "calendar_event_participant_groups_pkey";
alter table "public"."calendar_event_participant_groups"
add constraint "calendar_event_participant_groups_event_id_fkey" FOREIGN KEY (event_id) REFERENCES workspace_calendar_events(id) ON DELETE CASCADE not valid;
alter table "public"."calendar_event_participant_groups" validate constraint "calendar_event_participant_groups_event_id_fkey";
alter table "public"."calendar_event_participant_groups"
add constraint "calendar_event_participant_groups_group_id_fkey" FOREIGN KEY (group_id) REFERENCES workspace_user_groups(id) ON DELETE CASCADE not valid;
alter table "public"."calendar_event_participant_groups" validate constraint "calendar_event_participant_groups_group_id_fkey";
create or replace view "public"."calendar_event_participants" as
SELECT p.event_id,
  p.user_id AS participant_id,
  p.going,
  u.display_name,
  u.handle,
  'platform_user'::text AS type,
  p.created_at
FROM (
    calendar_event_platform_participants p
    JOIN users u ON ((u.id = p.user_id))
  )
UNION
SELECT p.event_id,
  p.user_id AS participant_id,
  p.going,
  u.name AS display_name,
  COALESCE(u.phone, u.email) AS handle,
  'virtual_user'::text AS type,
  p.created_at
FROM (
    calendar_event_virtual_participants p
    JOIN workspace_users u ON ((u.id = p.user_id))
  )
UNION
SELECT p.event_id,
  p.group_id AS participant_id,
  NULL::boolean AS going,
  g.name AS display_name,
  NULL::text AS handle,
  'user_group'::text AS type,
  p.created_at
FROM (
    calendar_event_participant_groups p
    JOIN workspace_user_groups g ON ((g.id = p.group_id))
  );
create policy "Allow select for workspace users and the participant" on "public"."calendar_event_participant_groups" as permissive for all to authenticated using (
  (
    EXISTS (
      SELECT 1
      FROM workspace_calendar_events e,
        workspace_user_groups g
      WHERE (
          (
            e.id = calendar_event_participant_groups.event_id
          )
          AND (
            g.id = calendar_event_participant_groups.group_id
          )
          AND (g.ws_id = e.ws_id)
        )
    )
  )
) with check (
  (
    EXISTS (
      SELECT 1
      FROM workspace_calendar_events e,
        workspace_user_groups g
      WHERE (
          (
            e.id = calendar_event_participant_groups.event_id
          )
          AND (
            g.id = calendar_event_participant_groups.group_id
          )
          AND (g.ws_id = e.ws_id)
        )
    )
  )
);
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
            AND (
              m.user_id = calendar_event_platform_participants.user_id
            )
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
            AND (
              m.user_id = calendar_event_platform_participants.user_id
            )
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
              AND (
                m.user_id = calendar_event_platform_participants.user_id
              )
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
              AND (
                m.user_id = calendar_event_platform_participants.user_id
              )
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
              AND (
                m.user_id = calendar_event_platform_participants.user_id
              )
              AND (m.ws_id = e.ws_id)
            )
        )
      )
    )
  );
select audit.enable_tracking(
    'public.calendar_event_participant_groups'::regclass
  );