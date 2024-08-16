create table "public"."user_group_post_checks" (
    "post_id" uuid not null,
    "user_id" uuid not null,
    "is_completed" boolean not null,
    "created_at" timestamp with time zone not null default now()
);


CREATE UNIQUE INDEX user_group_post_checks_pkey ON public.user_group_post_checks USING btree (post_id, user_id);

alter table "public"."user_group_post_checks" add constraint "user_group_post_checks_pkey" PRIMARY KEY using index "user_group_post_checks_pkey";

alter table "public"."user_group_post_checks" add constraint "user_group_post_checks_post_id_fkey" FOREIGN KEY (post_id) REFERENCES user_group_posts(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."user_group_post_checks" validate constraint "user_group_post_checks_post_id_fkey";

alter table "public"."user_group_post_checks" add constraint "user_group_post_checks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."user_group_post_checks" validate constraint "user_group_post_checks_user_id_fkey";

grant delete on table "public"."user_group_post_checks" to "anon";

grant insert on table "public"."user_group_post_checks" to "anon";

grant references on table "public"."user_group_post_checks" to "anon";

grant select on table "public"."user_group_post_checks" to "anon";

grant trigger on table "public"."user_group_post_checks" to "anon";

grant truncate on table "public"."user_group_post_checks" to "anon";

grant update on table "public"."user_group_post_checks" to "anon";

grant delete on table "public"."user_group_post_checks" to "authenticated";

grant insert on table "public"."user_group_post_checks" to "authenticated";

grant references on table "public"."user_group_post_checks" to "authenticated";

grant select on table "public"."user_group_post_checks" to "authenticated";

grant trigger on table "public"."user_group_post_checks" to "authenticated";

grant truncate on table "public"."user_group_post_checks" to "authenticated";

grant update on table "public"."user_group_post_checks" to "authenticated";

grant delete on table "public"."user_group_post_checks" to "service_role";

grant insert on table "public"."user_group_post_checks" to "service_role";

grant references on table "public"."user_group_post_checks" to "service_role";

grant select on table "public"."user_group_post_checks" to "service_role";

grant trigger on table "public"."user_group_post_checks" to "service_role";

grant truncate on table "public"."user_group_post_checks" to "service_role";

grant update on table "public"."user_group_post_checks" to "service_role";


