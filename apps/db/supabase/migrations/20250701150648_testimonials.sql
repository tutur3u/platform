create table "public"."testimonials" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid default gen_random_uuid(),
    "course_id" uuid default gen_random_uuid(),
    "content" text not null default ''::text,
    "rating" smallint not null default '5'::smallint,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."testimonials" enable row level security;

CREATE UNIQUE INDEX testimonials_pkey ON public.testimonials USING btree (id);

alter table "public"."testimonials" add constraint "testimonials_pkey" PRIMARY KEY using index "testimonials_pkey";

alter table "public"."testimonials" add constraint "check_rating_range" CHECK (((rating >= 1) AND (rating <= 5))) not valid;

alter table "public"."testimonials" validate constraint "check_rating_range";

alter table "public"."testimonials" add constraint "testimonials_course_id_fkey" FOREIGN KEY (course_id) REFERENCES workspace_courses(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."testimonials" validate constraint "testimonials_course_id_fkey";

alter table "public"."testimonials" add constraint "testimonials_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."testimonials" validate constraint "testimonials_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.validate_board_tags(tags jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  -- Use the normalize function for validation, but catch specific exceptions
  BEGIN
    PERFORM validate_and_normalize_board_tags(tags);
    RETURN true;
  EXCEPTION
    -- Only catch the specific exceptions we raise in validate_and_normalize_board_tags
    WHEN SQLSTATE '22000' THEN  -- our custom validation errors
      RETURN false;
    WHEN OTHERS THEN
      -- Re-raise unexpected errors to avoid masking bugs
      RAISE;
  END;
END;
$function$
;

grant delete on table "public"."testimonials" to "anon";

grant insert on table "public"."testimonials" to "anon";

grant references on table "public"."testimonials" to "anon";

grant select on table "public"."testimonials" to "anon";

grant trigger on table "public"."testimonials" to "anon";

grant truncate on table "public"."testimonials" to "anon";

grant update on table "public"."testimonials" to "anon";

grant delete on table "public"."testimonials" to "authenticated";

grant insert on table "public"."testimonials" to "authenticated";

grant references on table "public"."testimonials" to "authenticated";

grant select on table "public"."testimonials" to "authenticated";

grant trigger on table "public"."testimonials" to "authenticated";

grant truncate on table "public"."testimonials" to "authenticated";

grant update on table "public"."testimonials" to "authenticated";

grant delete on table "public"."testimonials" to "service_role";

grant insert on table "public"."testimonials" to "service_role";

grant references on table "public"."testimonials" to "service_role";

grant select on table "public"."testimonials" to "service_role";

grant trigger on table "public"."testimonials" to "service_role";

grant truncate on table "public"."testimonials" to "service_role";

grant update on table "public"."testimonials" to "service_role";

create policy "Enable delete for users based on user_id"
on "public"."testimonials"
as permissive
for delete
to public
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Enable insert for authenticated users only"
on "public"."testimonials"
as permissive
for insert
to authenticated
with check (true);


create policy "Enable insert for users based on user_id"
on "public"."testimonials"
as permissive
for insert
to public
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "Enable read access for all users"
on "public"."testimonials"
as permissive
for select
to public
using (true);


alter table "public"."testimonials" drop constraint "testimonials_course_id_fkey";

alter table "public"."testimonials" alter column "course_id" drop default;

alter table "public"."testimonials" alter column "user_id" set default auth.uid();

CREATE UNIQUE INDEX uq_testimonials ON public.testimonials USING btree (user_id, course_id);

alter table "public"."testimonials" add constraint "testimonials_course_id_fkey" FOREIGN KEY (course_id) REFERENCES workspace_courses(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."testimonials" validate constraint "testimonials_course_id_fkey";




