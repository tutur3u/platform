create table "public"."guest_poll_votes" (
    "id" uuid not null default gen_random_uuid(),
    "guest_id" uuid,
    "option_id" uuid,
    "created_at" timestamp with time zone not null default (now() AT TIME ZONE 'utc'::text)
);


alter table "public"."guest_poll_votes" enable row level security;

create table "public"."poll_option" (
    "id" uuid not null default gen_random_uuid(),
    "option_value" text default ''::text,
    "poll_id" uuid,
    "created_at" timestamp with time zone not null default (now() AT TIME ZONE 'utc'::text)
);


alter table "public"."poll_option" enable row level security;

create table "public"."polls" (
    "id" uuid not null default gen_random_uuid(),
    "poll_name" text default ''::text,
    "plan_id" uuid,
    "created_at" timestamp with time zone not null default (now() AT TIME ZONE 'utc'::text)
);


alter table "public"."polls" enable row level security;

create table "public"."users_poll_votes" (
    "id" uuid not null default gen_random_uuid(),
    "option_id" uuid,
    "user_id" uuid,
    "created_at" timestamp with time zone not null default (now() AT TIME ZONE 'utc'::text)
);


alter table "public"."users_poll_votes" enable row level security;


CREATE UNIQUE INDEX guest_poll_votes_pkey ON public.guest_poll_votes USING btree (id);

CREATE UNIQUE INDEX poll_option_pkey ON public.poll_option USING btree (id);

CREATE UNIQUE INDEX polls_pkey ON public.polls USING btree (id);

CREATE UNIQUE INDEX users_poll_votes_pkey ON public.users_poll_votes USING btree (id);

alter table "public"."guest_poll_votes" add constraint "guest_poll_votes_pkey" PRIMARY KEY using index "guest_poll_votes_pkey";

alter table "public"."poll_option" add constraint "poll_option_pkey" PRIMARY KEY using index "poll_option_pkey";

alter table "public"."polls" add constraint "polls_pkey" PRIMARY KEY using index "polls_pkey";

alter table "public"."users_poll_votes" add constraint "users_poll_votes_pkey" PRIMARY KEY using index "users_poll_votes_pkey";

alter table "public"."guest_poll_votes" add constraint "guest_poll_votes_guest_id_fkey" FOREIGN KEY (guest_id) REFERENCES meet_together_guests(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."guest_poll_votes" validate constraint "guest_poll_votes_guest_id_fkey";

alter table "public"."guest_poll_votes" add constraint "guest_poll_votes_option_id_fkey" FOREIGN KEY (option_id) REFERENCES poll_option(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."guest_poll_votes" validate constraint "guest_poll_votes_option_id_fkey";

alter table "public"."poll_option" add constraint "poll_option_poll_id_fkey" FOREIGN KEY (poll_id) REFERENCES polls(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."poll_option" validate constraint "poll_option_poll_id_fkey";

alter table "public"."polls" add constraint "polls_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES meet_together_plans(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."polls" validate constraint "polls_plan_id_fkey";

alter table "public"."users_poll_votes" add constraint "users_poll_votes_option_id_fkey" FOREIGN KEY (option_id) REFERENCES poll_option(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."users_poll_votes" validate constraint "users_poll_votes_option_id_fkey";

alter table "public"."users_poll_votes" add constraint "users_poll_votes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."users_poll_votes" validate constraint "users_poll_votes_user_id_fkey";

grant delete on table "public"."guest_poll_votes" to "anon";

grant insert on table "public"."guest_poll_votes" to "anon";

grant references on table "public"."guest_poll_votes" to "anon";

grant select on table "public"."guest_poll_votes" to "anon";

grant trigger on table "public"."guest_poll_votes" to "anon";

grant truncate on table "public"."guest_poll_votes" to "anon";

grant update on table "public"."guest_poll_votes" to "anon";

grant delete on table "public"."guest_poll_votes" to "authenticated";

grant insert on table "public"."guest_poll_votes" to "authenticated";

grant references on table "public"."guest_poll_votes" to "authenticated";

grant select on table "public"."guest_poll_votes" to "authenticated";

grant trigger on table "public"."guest_poll_votes" to "authenticated";

grant truncate on table "public"."guest_poll_votes" to "authenticated";

grant update on table "public"."guest_poll_votes" to "authenticated";

grant delete on table "public"."guest_poll_votes" to "service_role";

grant insert on table "public"."guest_poll_votes" to "service_role";

grant references on table "public"."guest_poll_votes" to "service_role";

grant select on table "public"."guest_poll_votes" to "service_role";

grant trigger on table "public"."guest_poll_votes" to "service_role";

grant truncate on table "public"."guest_poll_votes" to "service_role";

grant update on table "public"."guest_poll_votes" to "service_role";

grant delete on table "public"."poll_option" to "anon";

grant insert on table "public"."poll_option" to "anon";

grant references on table "public"."poll_option" to "anon";

grant select on table "public"."poll_option" to "anon";

grant trigger on table "public"."poll_option" to "anon";

grant truncate on table "public"."poll_option" to "anon";

grant update on table "public"."poll_option" to "anon";

grant delete on table "public"."poll_option" to "authenticated";

grant insert on table "public"."poll_option" to "authenticated";

grant references on table "public"."poll_option" to "authenticated";

grant select on table "public"."poll_option" to "authenticated";

grant trigger on table "public"."poll_option" to "authenticated";

grant truncate on table "public"."poll_option" to "authenticated";

grant update on table "public"."poll_option" to "authenticated";

grant delete on table "public"."poll_option" to "service_role";

grant insert on table "public"."poll_option" to "service_role";

grant references on table "public"."poll_option" to "service_role";

grant select on table "public"."poll_option" to "service_role";

grant trigger on table "public"."poll_option" to "service_role";

grant truncate on table "public"."poll_option" to "service_role";

grant update on table "public"."poll_option" to "service_role";

grant delete on table "public"."polls" to "anon";

grant insert on table "public"."polls" to "anon";

grant references on table "public"."polls" to "anon";

grant select on table "public"."polls" to "anon";

grant trigger on table "public"."polls" to "anon";

grant truncate on table "public"."polls" to "anon";

grant update on table "public"."polls" to "anon";

grant delete on table "public"."polls" to "authenticated";

grant insert on table "public"."polls" to "authenticated";

grant references on table "public"."polls" to "authenticated";

grant select on table "public"."polls" to "authenticated";

grant trigger on table "public"."polls" to "authenticated";

grant truncate on table "public"."polls" to "authenticated";

grant update on table "public"."polls" to "authenticated";

grant delete on table "public"."polls" to "service_role";

grant insert on table "public"."polls" to "service_role";

grant references on table "public"."polls" to "service_role";

grant select on table "public"."polls" to "service_role";

grant trigger on table "public"."polls" to "service_role";

grant truncate on table "public"."polls" to "service_role";

grant update on table "public"."polls" to "service_role";

grant delete on table "public"."users_poll_votes" to "anon";

grant insert on table "public"."users_poll_votes" to "anon";

grant references on table "public"."users_poll_votes" to "anon";

grant select on table "public"."users_poll_votes" to "anon";

grant trigger on table "public"."users_poll_votes" to "anon";

grant truncate on table "public"."users_poll_votes" to "anon";

grant update on table "public"."users_poll_votes" to "anon";

grant delete on table "public"."users_poll_votes" to "authenticated";

grant insert on table "public"."users_poll_votes" to "authenticated";

grant references on table "public"."users_poll_votes" to "authenticated";

grant select on table "public"."users_poll_votes" to "authenticated";

grant trigger on table "public"."users_poll_votes" to "authenticated";

grant truncate on table "public"."users_poll_votes" to "authenticated";

grant update on table "public"."users_poll_votes" to "authenticated";

grant delete on table "public"."users_poll_votes" to "service_role";

grant insert on table "public"."users_poll_votes" to "service_role";

grant references on table "public"."users_poll_votes" to "service_role";

grant select on table "public"."users_poll_votes" to "service_role";

grant trigger on table "public"."users_poll_votes" to "service_role";

grant truncate on table "public"."users_poll_votes" to "service_role";

grant update on table "public"."users_poll_votes" to "service_role";

create policy "Enable read access for all users"
on "public"."guest_poll_votes"
as permissive
for select
to public
using (true);


create policy "Enable insert for all users"
on "public"."poll_option"
as permissive
for insert
to public
with check (true);


create policy "Enable read access for all users"
on "public"."poll_option"
as permissive
for select
to public
using (true);


create policy "Enable insert for authenticated users only"
on "public"."polls"
as permissive
for insert
to authenticated
with check (true);


create policy "Enable read access for all users"
on "public"."polls"
as permissive
for select
to public
using (true);


create policy "Enable insert for users based on user_id"
on "public"."users_poll_votes"
as permissive
for insert
to public
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "Enable read access for all users"
on "public"."users_poll_votes"
as permissive
for select
to public
using (true);


create policy "Enable update for users based on uid"
on "public"."users_poll_votes"
as permissive
for update
to public
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));



