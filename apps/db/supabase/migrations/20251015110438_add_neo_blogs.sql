create table "public"."neo_blogs" (
    "id" uuid not null default gen_random_uuid(),
    "title" text not null,
    "excerpt" text,
    "content" text,
    "author" text,
    "date_published" timestamp with time zone not null default now(),
    "category" text,
    "image_url" text,
    "read_time" text,
    "views_count" bigint not null default '0'::bigint,
    "likes_count" bigint not null default '0'::bigint,
    "tags" text[],
    "is_published" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "slug" text not null
);


alter table "public"."neo_blogs" enable row level security;

CREATE UNIQUE INDEX blogs_pkey ON public.neo_blogs USING btree (id);

alter table "public"."neo_blogs" add constraint "blogs_pkey" PRIMARY KEY using index "blogs_pkey";

grant delete on table "public"."neo_blogs" to "anon";

grant insert on table "public"."neo_blogs" to "anon";

grant references on table "public"."neo_blogs" to "anon";

grant select on table "public"."neo_blogs" to "anon";

grant trigger on table "public"."neo_blogs" to "anon";

grant truncate on table "public"."neo_blogs" to "anon";

grant update on table "public"."neo_blogs" to "anon";

grant delete on table "public"."neo_blogs" to "authenticated";

grant insert on table "public"."neo_blogs" to "authenticated";

grant references on table "public"."neo_blogs" to "authenticated";

grant select on table "public"."neo_blogs" to "authenticated";

grant trigger on table "public"."neo_blogs" to "authenticated";

grant truncate on table "public"."neo_blogs" to "authenticated";

grant update on table "public"."neo_blogs" to "authenticated";

grant delete on table "public"."neo_blogs" to "service_role";

grant insert on table "public"."neo_blogs" to "service_role";

grant references on table "public"."neo_blogs" to "service_role";

grant select on table "public"."neo_blogs" to "service_role";

grant trigger on table "public"."neo_blogs" to "service_role";

grant truncate on table "public"."neo_blogs" to "service_role";

grant update on table "public"."neo_blogs" to "service_role";

create policy "Enable read access for all users"
on "public"."neo_blogs"
as permissive
for select
to public
using (true);



