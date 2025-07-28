create table "public"."plan_comments" (
    "id" uuid not null default gen_random_uuid(),
    "plan_id" uuid not null,
    "user_id" uuid,
    "guest_id" uuid,
    "author_name" text not null,
    "content" text not null,
    "created_at" timestamp with time zone default now()
);


CREATE UNIQUE INDEX plan_comments_pkey ON public.plan_comments USING btree (id);

alter table "public"."plan_comments" add constraint "plan_comments_pkey" PRIMARY KEY using index "plan_comments_pkey";

alter table "public"."plan_comments" add constraint "plan_comments_guest_id_fkey" FOREIGN KEY (guest_id) REFERENCES meet_together_guests(id) ON DELETE SET NULL not valid;

alter table "public"."plan_comments" validate constraint "plan_comments_guest_id_fkey";

alter table "public"."plan_comments" add constraint "plan_comments_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES meet_together_plans(id) ON DELETE CASCADE not valid;

alter table "public"."plan_comments" validate constraint "plan_comments_plan_id_fkey";

alter table "public"."plan_comments" add constraint "plan_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL not valid;

alter table "public"."plan_comments" validate constraint "plan_comments_user_id_fkey";

grant delete on table "public"."plan_comments" to "anon";

grant insert on table "public"."plan_comments" to "anon";

grant references on table "public"."plan_comments" to "anon";

grant select on table "public"."plan_comments" to "anon";

grant trigger on table "public"."plan_comments" to "anon";

grant truncate on table "public"."plan_comments" to "anon";

grant update on table "public"."plan_comments" to "anon";

grant delete on table "public"."plan_comments" to "authenticated";

grant insert on table "public"."plan_comments" to "authenticated";

grant references on table "public"."plan_comments" to "authenticated";

grant select on table "public"."plan_comments" to "authenticated";

grant trigger on table "public"."plan_comments" to "authenticated";

grant truncate on table "public"."plan_comments" to "authenticated";

grant update on table "public"."plan_comments" to "authenticated";

grant delete on table "public"."plan_comments" to "service_role";

grant insert on table "public"."plan_comments" to "service_role";

grant references on table "public"."plan_comments" to "service_role";

grant select on table "public"."plan_comments" to "service_role";

grant trigger on table "public"."plan_comments" to "service_role";

grant truncate on table "public"."plan_comments" to "service_role";

grant update on table "public"."plan_comments" to "service_role";


