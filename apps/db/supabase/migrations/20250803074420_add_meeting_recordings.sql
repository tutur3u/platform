create type "public"."recording_status" as enum ('recording', 'interrupted', 'pending_transcription', 'transcribing', 'completed', 'failed');

create table "public"."audio_chunks" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid not null,
    "chunk_order" integer not null,
    "storage_path" text not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."audio_chunks" enable row level security;

create table "public"."recording_sessions" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "meeting_id" uuid not null,
    "status" recording_status not null default 'recording'::recording_status,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."recording_sessions" enable row level security;

create table "public"."recording_transcripts" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid not null,
    "text" text not null,
    "segments" jsonb,
    "language" text not null default 'en',
    "duration_in_seconds" integer not null default 0,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."recording_transcripts" enable row level security;

create table "public"."workspace_meetings" (
    "id" uuid not null default gen_random_uuid(),
    "ws_id" uuid not null,
    "name" text not null,
    "time" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now(),
    "creator_id" uuid not null
);


alter table "public"."workspace_meetings" enable row level security;

CREATE UNIQUE INDEX audio_chunks_pkey ON public.audio_chunks USING btree (id);

CREATE UNIQUE INDEX audio_chunks_session_id_chunk_order_key ON public.audio_chunks USING btree (session_id, chunk_order);

CREATE UNIQUE INDEX recording_sessions_pkey ON public.recording_sessions USING btree (id);

CREATE UNIQUE INDEX recording_transcripts_pkey ON public.recording_transcripts USING btree (id);

CREATE UNIQUE INDEX recording_transcripts_session_id_key ON public.recording_transcripts USING btree (session_id);

CREATE UNIQUE INDEX workspace_meetings_pkey ON public.workspace_meetings USING btree (id);

alter table "public"."audio_chunks" add constraint "audio_chunks_pkey" PRIMARY KEY using index "audio_chunks_pkey";

alter table "public"."audio_chunks" add constraint "audio_chunks_session_id_chunk_order_key" UNIQUE using index "audio_chunks_session_id_chunk_order_key";

alter table "public"."recording_sessions" add constraint "recording_sessions_pkey" PRIMARY KEY using index "recording_sessions_pkey";

alter table "public"."recording_transcripts" add constraint "recording_transcripts_pkey" PRIMARY KEY using index "recording_transcripts_pkey";

alter table "public"."workspace_meetings" add constraint "workspace_meetings_pkey" PRIMARY KEY using index "workspace_meetings_pkey";

alter table "public"."audio_chunks" add constraint "audio_chunks_session_id_fkey" FOREIGN KEY (session_id) REFERENCES recording_sessions(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."audio_chunks" validate constraint "audio_chunks_session_id_fkey";

alter table "public"."recording_sessions" add constraint "recording_sessions_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES workspace_meetings(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."recording_sessions" validate constraint "recording_sessions_meeting_id_fkey";

alter table "public"."recording_sessions" add constraint "recording_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."recording_sessions" validate constraint "recording_sessions_user_id_fkey";

alter table "public"."recording_transcripts" add constraint "recording_transcripts_session_id_fkey" FOREIGN KEY (session_id) REFERENCES recording_sessions(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."recording_transcripts" validate constraint "recording_transcripts_session_id_fkey";

alter table "public"."recording_transcripts" add constraint "recording_transcripts_session_id_key" UNIQUE using index "recording_transcripts_session_id_key";

alter table "public"."workspace_meetings" add constraint "workspace_meetings_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE not valid;

alter table "public"."workspace_meetings" validate constraint "workspace_meetings_creator_id_fkey";

alter table "public"."workspace_meetings" add constraint "workspace_meetings_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_meetings" validate constraint "workspace_meetings_ws_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

grant delete on table "public"."audio_chunks" to "anon";

grant insert on table "public"."audio_chunks" to "anon";

grant references on table "public"."audio_chunks" to "anon";

grant select on table "public"."audio_chunks" to "anon";

grant trigger on table "public"."audio_chunks" to "anon";

grant truncate on table "public"."audio_chunks" to "anon";

grant update on table "public"."audio_chunks" to "anon";

grant delete on table "public"."audio_chunks" to "authenticated";

grant insert on table "public"."audio_chunks" to "authenticated";

grant references on table "public"."audio_chunks" to "authenticated";

grant select on table "public"."audio_chunks" to "authenticated";

grant trigger on table "public"."audio_chunks" to "authenticated";

grant truncate on table "public"."audio_chunks" to "authenticated";

grant update on table "public"."audio_chunks" to "authenticated";

grant delete on table "public"."audio_chunks" to "service_role";

grant insert on table "public"."audio_chunks" to "service_role";

grant references on table "public"."audio_chunks" to "service_role";

grant select on table "public"."audio_chunks" to "service_role";

grant trigger on table "public"."audio_chunks" to "service_role";

grant truncate on table "public"."audio_chunks" to "service_role";

grant update on table "public"."audio_chunks" to "service_role";

grant delete on table "public"."recording_sessions" to "anon";

grant insert on table "public"."recording_sessions" to "anon";

grant references on table "public"."recording_sessions" to "anon";

grant select on table "public"."recording_sessions" to "anon";

grant trigger on table "public"."recording_sessions" to "anon";

grant truncate on table "public"."recording_sessions" to "anon";

grant update on table "public"."recording_sessions" to "anon";

grant delete on table "public"."recording_sessions" to "authenticated";

grant insert on table "public"."recording_sessions" to "authenticated";

grant references on table "public"."recording_sessions" to "authenticated";

grant select on table "public"."recording_sessions" to "authenticated";

grant trigger on table "public"."recording_sessions" to "authenticated";

grant truncate on table "public"."recording_sessions" to "authenticated";

grant update on table "public"."recording_sessions" to "authenticated";

grant delete on table "public"."recording_sessions" to "service_role";

grant insert on table "public"."recording_sessions" to "service_role";

grant references on table "public"."recording_sessions" to "service_role";

grant select on table "public"."recording_sessions" to "service_role";

grant trigger on table "public"."recording_sessions" to "service_role";

grant truncate on table "public"."recording_sessions" to "service_role";

grant update on table "public"."recording_sessions" to "service_role";

grant delete on table "public"."recording_transcripts" to "anon";

grant insert on table "public"."recording_transcripts" to "anon";

grant references on table "public"."recording_transcripts" to "anon";

grant select on table "public"."recording_transcripts" to "anon";

grant trigger on table "public"."recording_transcripts" to "anon";

grant truncate on table "public"."recording_transcripts" to "anon";

grant update on table "public"."recording_transcripts" to "anon";

grant delete on table "public"."recording_transcripts" to "authenticated";

grant insert on table "public"."recording_transcripts" to "authenticated";

grant references on table "public"."recording_transcripts" to "authenticated";

grant select on table "public"."recording_transcripts" to "authenticated";

grant trigger on table "public"."recording_transcripts" to "authenticated";

grant truncate on table "public"."recording_transcripts" to "authenticated";

grant update on table "public"."recording_transcripts" to "authenticated";

grant delete on table "public"."recording_transcripts" to "service_role";

grant insert on table "public"."recording_transcripts" to "service_role";

grant references on table "public"."recording_transcripts" to "service_role";

grant select on table "public"."recording_transcripts" to "service_role";

grant trigger on table "public"."recording_transcripts" to "service_role";

grant truncate on table "public"."recording_transcripts" to "service_role";

grant update on table "public"."recording_transcripts" to "service_role";

grant delete on table "public"."workspace_meetings" to "anon";

grant insert on table "public"."workspace_meetings" to "anon";

grant references on table "public"."workspace_meetings" to "anon";

grant select on table "public"."workspace_meetings" to "anon";

grant trigger on table "public"."workspace_meetings" to "anon";

grant truncate on table "public"."workspace_meetings" to "anon";

grant update on table "public"."workspace_meetings" to "anon";

grant delete on table "public"."workspace_meetings" to "authenticated";

grant insert on table "public"."workspace_meetings" to "authenticated";

grant references on table "public"."workspace_meetings" to "authenticated";

grant select on table "public"."workspace_meetings" to "authenticated";

grant trigger on table "public"."workspace_meetings" to "authenticated";

grant truncate on table "public"."workspace_meetings" to "authenticated";

grant update on table "public"."workspace_meetings" to "authenticated";

grant delete on table "public"."workspace_meetings" to "service_role";

grant insert on table "public"."workspace_meetings" to "service_role";

grant references on table "public"."workspace_meetings" to "service_role";

grant select on table "public"."workspace_meetings" to "service_role";

grant trigger on table "public"."workspace_meetings" to "service_role";

grant truncate on table "public"."workspace_meetings" to "service_role";

grant update on table "public"."workspace_meetings" to "service_role";

CREATE TRIGGER update_recording_sessions_updated_at BEFORE UPDATE ON public.recording_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


