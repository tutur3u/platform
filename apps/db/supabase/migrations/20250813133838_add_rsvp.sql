create type "public"."event_attendee_status" as enum ('pending', 'accepted', 'declined', 'tentative');

create type "public"."event_status" as enum ('active', 'cancelled', 'completed', 'draft');

create table "public"."event_attendees" (
    "id" uuid not null default gen_random_uuid(),
    "event_id" uuid not null,
    "user_id" uuid,
    "status" event_attendee_status default 'pending'::event_attendee_status,
    "response_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone default now()
);


alter table "public"."event_attendees" enable row level security;

create table "public"."event_invitations" (
    "id" uuid not null default gen_random_uuid(),
    "event_id" uuid,
    "invitee_id" uuid,
    "invitation_token" uuid default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."event_invitations" enable row level security;

create table "public"."workspace_scheduled_events" (
    "id" uuid not null default gen_random_uuid(),
    "ws_id" uuid,
    "title" text not null,
    "description" text,
    "start_at" timestamp with time zone,
    "end_at" timestamp with time zone,
    "location" text,
    "color" text,
    "creator_id" uuid,
    "is_all_day" boolean default false,
    "requires_confirmation" boolean default true,
    "status" event_status default 'active'::event_status,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone default now()
);


alter table "public"."workspace_scheduled_events" enable row level security;

CREATE UNIQUE INDEX event_attendees_pkey ON public.event_attendees USING btree (id);

CREATE UNIQUE INDEX event_attendees_unique_user_event ON public.event_attendees USING btree (event_id, user_id);

CREATE UNIQUE INDEX event_invitations_pkey ON public.event_invitations USING btree (id);

CREATE UNIQUE INDEX workspace_scheduled_events_pkey ON public.workspace_scheduled_events USING btree (id);

alter table "public"."event_attendees" add constraint "event_attendees_pkey" PRIMARY KEY using index "event_attendees_pkey";

alter table "public"."event_invitations" add constraint "event_invitations_pkey" PRIMARY KEY using index "event_invitations_pkey";

alter table "public"."workspace_scheduled_events" add constraint "workspace_scheduled_events_pkey" PRIMARY KEY using index "workspace_scheduled_events_pkey";

alter table "public"."event_attendees" add constraint "event_attendees_event_id_fkey" FOREIGN KEY (event_id) REFERENCES workspace_scheduled_events(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."event_attendees" validate constraint "event_attendees_event_id_fkey";

alter table "public"."event_attendees" add constraint "event_attendees_unique_user_event" UNIQUE using index "event_attendees_unique_user_event";

alter table "public"."event_attendees" add constraint "event_attendees_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."event_attendees" validate constraint "event_attendees_user_id_fkey";

alter table "public"."event_invitations" add constraint "event_invitations_event_id_fkey" FOREIGN KEY (event_id) REFERENCES workspace_scheduled_events(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."event_invitations" validate constraint "event_invitations_event_id_fkey";

alter table "public"."event_invitations" add constraint "event_invitations_invitee_id_fkey" FOREIGN KEY (invitee_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."event_invitations" validate constraint "event_invitations_invitee_id_fkey";

alter table "public"."workspace_scheduled_events" add constraint "workspace_scheduled_events_color_fkey" FOREIGN KEY (color) REFERENCES calendar_event_colors(value) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_scheduled_events" validate constraint "workspace_scheduled_events_color_fkey";

alter table "public"."workspace_scheduled_events" add constraint "workspace_scheduled_events_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_scheduled_events" validate constraint "workspace_scheduled_events_creator_id_fkey";

alter table "public"."workspace_scheduled_events" add constraint "workspace_scheduled_events_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_scheduled_events" validate constraint "workspace_scheduled_events_ws_id_fkey";

grant delete on table "public"."event_attendees" to "anon";

grant insert on table "public"."event_attendees" to "anon";

grant references on table "public"."event_attendees" to "anon";

grant select on table "public"."event_attendees" to "anon";

grant trigger on table "public"."event_attendees" to "anon";

grant truncate on table "public"."event_attendees" to "anon";

grant update on table "public"."event_attendees" to "anon";

grant delete on table "public"."event_attendees" to "authenticated";

grant insert on table "public"."event_attendees" to "authenticated";

grant references on table "public"."event_attendees" to "authenticated";

grant select on table "public"."event_attendees" to "authenticated";

grant trigger on table "public"."event_attendees" to "authenticated";

grant truncate on table "public"."event_attendees" to "authenticated";

grant update on table "public"."event_attendees" to "authenticated";

grant delete on table "public"."event_attendees" to "service_role";

grant insert on table "public"."event_attendees" to "service_role";

grant references on table "public"."event_attendees" to "service_role";

grant select on table "public"."event_attendees" to "service_role";

grant trigger on table "public"."event_attendees" to "service_role";

grant truncate on table "public"."event_attendees" to "service_role";

grant update on table "public"."event_attendees" to "service_role";

grant delete on table "public"."event_invitations" to "anon";

grant insert on table "public"."event_invitations" to "anon";

grant references on table "public"."event_invitations" to "anon";

grant select on table "public"."event_invitations" to "anon";

grant trigger on table "public"."event_invitations" to "anon";

grant truncate on table "public"."event_invitations" to "anon";

grant update on table "public"."event_invitations" to "anon";

grant delete on table "public"."event_invitations" to "authenticated";

grant insert on table "public"."event_invitations" to "authenticated";

grant references on table "public"."event_invitations" to "authenticated";

grant select on table "public"."event_invitations" to "authenticated";

grant trigger on table "public"."event_invitations" to "authenticated";

grant truncate on table "public"."event_invitations" to "authenticated";

grant update on table "public"."event_invitations" to "authenticated";

grant delete on table "public"."event_invitations" to "service_role";

grant insert on table "public"."event_invitations" to "service_role";

grant references on table "public"."event_invitations" to "service_role";

grant select on table "public"."event_invitations" to "service_role";

grant trigger on table "public"."event_invitations" to "service_role";

grant truncate on table "public"."event_invitations" to "service_role";

grant update on table "public"."event_invitations" to "service_role";

grant delete on table "public"."workspace_scheduled_events" to "anon";

grant insert on table "public"."workspace_scheduled_events" to "anon";

grant references on table "public"."workspace_scheduled_events" to "anon";

grant select on table "public"."workspace_scheduled_events" to "anon";

grant trigger on table "public"."workspace_scheduled_events" to "anon";

grant truncate on table "public"."workspace_scheduled_events" to "anon";

grant update on table "public"."workspace_scheduled_events" to "anon";

grant delete on table "public"."workspace_scheduled_events" to "authenticated";

grant insert on table "public"."workspace_scheduled_events" to "authenticated";

grant references on table "public"."workspace_scheduled_events" to "authenticated";

grant select on table "public"."workspace_scheduled_events" to "authenticated";

grant trigger on table "public"."workspace_scheduled_events" to "authenticated";

grant truncate on table "public"."workspace_scheduled_events" to "authenticated";

grant update on table "public"."workspace_scheduled_events" to "authenticated";

grant delete on table "public"."workspace_scheduled_events" to "service_role";

grant insert on table "public"."workspace_scheduled_events" to "service_role";

grant references on table "public"."workspace_scheduled_events" to "service_role";

grant select on table "public"."workspace_scheduled_events" to "service_role";

grant trigger on table "public"."workspace_scheduled_events" to "service_role";

grant truncate on table "public"."workspace_scheduled_events" to "service_role";

grant update on table "public"."workspace_scheduled_events" to "service_role";

create policy "Event creators can view all attendees"
on "public"."event_attendees"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM workspace_scheduled_events
  WHERE ((workspace_scheduled_events.id = event_attendees.event_id) AND (workspace_scheduled_events.creator_id = auth.uid())))));


create policy "Users can update their own attendance"
on "public"."event_attendees"
as permissive
for update
to public
using ((user_id = auth.uid()));


create policy "Users can view attendees of workspace events"
on "public"."event_attendees"
as permissive
for select
to public
using (
  EXISTS (
    SELECT 1
    FROM workspace_scheduled_events wse
    JOIN workspace_members wm ON wm.ws_id = wse.ws_id
    WHERE wse.id = event_attendees.event_id
      AND wm.user_id = auth.uid()
  )
);


create policy "Event creators can manage invitations"
on "public"."event_invitations"
as permissive
for all
to public
using ((EXISTS ( SELECT 1
   FROM workspace_scheduled_events
  WHERE ((workspace_scheduled_events.id = event_invitations.event_id) AND (workspace_scheduled_events.creator_id = auth.uid())))));


create policy "Users can view invitations sent to them"
on "public"."event_invitations"
as permissive
for select
to public
using ((invitee_id = auth.uid()));


create policy "Event creators can manage their events"
on "public"."workspace_scheduled_events"
as permissive
for all
to public
using ((creator_id = auth.uid()));


create policy "Workspace members can view events"
on "public"."workspace_scheduled_events"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM workspace_members
  WHERE ((workspace_members.ws_id = workspace_scheduled_events.ws_id) AND (workspace_members.user_id = auth.uid())))));



