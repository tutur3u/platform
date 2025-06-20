create table "public"."whiteboards" (
    "id" uuid not null default gen_random_uuid(),
    "title" text not null,
    "description" text,
    "snapshot" jsonb,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "thumbnail_url" text,
    "updated_at" timestamp with time zone not null default now(),
    "creator_id" uuid not null
);

alter table "public"."whiteboards" enable row level security;

CREATE UNIQUE INDEX whiteboards_pkey ON public.whiteboards USING btree (id);

alter table "public"."whiteboards" add constraint "whiteboards_pkey" PRIMARY KEY using index "whiteboards_pkey";

alter table "public"."whiteboards" add constraint "whiteboards_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."whiteboards" validate constraint "whiteboards_creator_id_fkey";

alter table "public"."whiteboards" add constraint "whiteboards_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."whiteboards" validate constraint "whiteboards_ws_id_fkey";

grant delete on table "public"."whiteboards" to "anon";

grant insert on table "public"."whiteboards" to "anon";

grant references on table "public"."whiteboards" to "anon";

grant select on table "public"."whiteboards" to "anon";

grant trigger on table "public"."whiteboards" to "anon";

grant truncate on table "public"."whiteboards" to "anon";

grant update on table "public"."whiteboards" to "anon";

grant delete on table "public"."whiteboards" to "authenticated";

grant insert on table "public"."whiteboards" to "authenticated";

grant references on table "public"."whiteboards" to "authenticated";

grant select on table "public"."whiteboards" to "authenticated";

grant trigger on table "public"."whiteboards" to "authenticated";

grant truncate on table "public"."whiteboards" to "authenticated";

grant update on table "public"."whiteboards" to "authenticated";

grant delete on table "public"."whiteboards" to "service_role";

grant insert on table "public"."whiteboards" to "service_role";

grant references on table "public"."whiteboards" to "service_role";

grant select on table "public"."whiteboards" to "service_role";

grant trigger on table "public"."whiteboards" to "service_role";

grant truncate on table "public"."whiteboards" to "service_role";

grant update on table "public"."whiteboards" to "service_role";


