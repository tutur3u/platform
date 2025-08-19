create table "public"."media_uploads" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "storage_path" text not null,
    "duration_seconds" integer,
    "status" text not null default 'uploaded' check (status in ('uploaded', 'processing', 'completed', 'failed')),
    "created_at" timestamp with time zone not null default now()
);

create table "public"."recording_transcripts" (
    "id" uuid not null default gen_random_uuid(),
    "media_upload_id" uuid not null,
    "text" text not null,
    "segments" jsonb,
    "language" text not null default 'en',
    "duration_in_seconds" integer not null default 0,
    "created_at" timestamp with time zone not null default now()
);

create table "public"."meeting_notes" (
    "id" uuid not null default gen_random_uuid(),
    "media_upload_id" uuid not null,
    "transcript_id" uuid,
    "notes_markdown" text not null,
    "created_at" timestamp with time zone not null default now()
);

CREATE UNIQUE INDEX media_uploads_pkey ON public.media_uploads USING btree (id);
CREATE UNIQUE INDEX recording_transcripts_pkey ON public.recording_transcripts USING btree (id);
CREATE UNIQUE INDEX meeting_notes_pkey ON public.meeting_notes USING btree (id);

alter table "public"."media_uploads" add constraint "media_uploads_pkey" PRIMARY KEY using index "media_uploads_pkey";
alter table "public"."recording_transcripts" add constraint "recording_transcripts_pkey" PRIMARY KEY using index "recording_transcripts_pkey";
alter table "public"."meeting_notes" add constraint "meeting_notes_pkey" PRIMARY KEY using index "meeting_notes_pkey";

alter table "public"."media_uploads" add constraint "media_uploads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table "public"."recording_transcripts" add constraint "recording_transcripts_media_upload_id_fkey" FOREIGN KEY (media_upload_id) REFERENCES media_uploads(id) ON DELETE CASCADE;
alter table "public"."meeting_notes" add constraint "meeting_notes_media_upload_id_fkey" FOREIGN KEY (media_upload_id) REFERENCES media_uploads(id) ON DELETE CASCADE;
alter table "public"."meeting_notes" add constraint "meeting_notes_transcript_id_fkey" FOREIGN KEY (transcript_id) REFERENCES recording_transcripts(id) ON DELETE SET NULL;

alter table "public"."media_uploads" enable row level security;
alter table "public"."recording_transcripts" enable row level security;
alter table "public"."meeting_notes" enable row level security;