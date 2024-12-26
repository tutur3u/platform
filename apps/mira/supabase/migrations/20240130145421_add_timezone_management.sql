create table "public"."meet-together-plans" (
    "id" uuid not null default gen_random_uuid(),
    "name" text,
    "dates" date[] not null,
    "start_time" time with time zone not null,
    "end_time" time with time zone not null,
    "created_at" timestamp with time zone default now()
);


alter table "public"."meet-together-plans" enable row level security;

create table "public"."timezones" (
    "value" text not null,
    "abbr" text not null,
    "offset" real not null,
    "isdst" boolean not null,
    "text" text not null,
    "utc" text[] not null,
    "created_at" timestamp with time zone default now(),
    "id" uuid not null default gen_random_uuid()
);


alter table "public"."timezones" enable row level security;

CREATE UNIQUE INDEX "meet-together-plans_pkey" ON public."meet-together-plans" USING btree (id);

CREATE UNIQUE INDEX timezones_pkey ON public.timezones USING btree (id);

alter table "public"."meet-together-plans" add constraint "meet-together-plans_pkey" PRIMARY KEY using index "meet-together-plans_pkey";

alter table "public"."timezones" add constraint "timezones_pkey" PRIMARY KEY using index "timezones_pkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.create_ai_chat(title text, message text, model text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare generated_chat_id uuid;
begin generated_chat_id := gen_random_uuid();
insert into ai_chats (id, title, creator_id, model)
values (generated_chat_id, title, auth.uid(), model);
insert into ai_chat_messages (chat_id, content, creator_id, role)
values (generated_chat_id, message, auth.uid(), 'USER');
return generated_chat_id;
end;
$function$
;

grant delete on table "public"."meet-together-plans" to "anon";

grant insert on table "public"."meet-together-plans" to "anon";

grant references on table "public"."meet-together-plans" to "anon";

grant select on table "public"."meet-together-plans" to "anon";

grant trigger on table "public"."meet-together-plans" to "anon";

grant truncate on table "public"."meet-together-plans" to "anon";

grant update on table "public"."meet-together-plans" to "anon";

grant delete on table "public"."meet-together-plans" to "authenticated";

grant insert on table "public"."meet-together-plans" to "authenticated";

grant references on table "public"."meet-together-plans" to "authenticated";

grant select on table "public"."meet-together-plans" to "authenticated";

grant trigger on table "public"."meet-together-plans" to "authenticated";

grant truncate on table "public"."meet-together-plans" to "authenticated";

grant update on table "public"."meet-together-plans" to "authenticated";

grant delete on table "public"."meet-together-plans" to "service_role";

grant insert on table "public"."meet-together-plans" to "service_role";

grant references on table "public"."meet-together-plans" to "service_role";

grant select on table "public"."meet-together-plans" to "service_role";

grant trigger on table "public"."meet-together-plans" to "service_role";

grant truncate on table "public"."meet-together-plans" to "service_role";

grant update on table "public"."meet-together-plans" to "service_role";

grant delete on table "public"."timezones" to "anon";

grant insert on table "public"."timezones" to "anon";

grant references on table "public"."timezones" to "anon";

grant select on table "public"."timezones" to "anon";

grant trigger on table "public"."timezones" to "anon";

grant truncate on table "public"."timezones" to "anon";

grant update on table "public"."timezones" to "anon";

grant delete on table "public"."timezones" to "authenticated";

grant insert on table "public"."timezones" to "authenticated";

grant references on table "public"."timezones" to "authenticated";

grant select on table "public"."timezones" to "authenticated";

grant trigger on table "public"."timezones" to "authenticated";

grant truncate on table "public"."timezones" to "authenticated";

grant update on table "public"."timezones" to "authenticated";

grant delete on table "public"."timezones" to "service_role";

grant insert on table "public"."timezones" to "service_role";

grant references on table "public"."timezones" to "service_role";

grant select on table "public"."timezones" to "service_role";

grant trigger on table "public"."timezones" to "service_role";

grant truncate on table "public"."timezones" to "service_role";

grant update on table "public"."timezones" to "service_role";

create policy "Allow modification for platform admins"
on "public"."timezones"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_members wm
  WHERE ((wm.ws_id = '00000000-0000-0000-0000-000000000000'::uuid) AND (wm.user_id = auth.uid()) AND ((wm.role = 'ADMIN'::text) OR (wm.role = 'OWNER'::text))))))
with check ((EXISTS ( SELECT 1
   FROM workspace_members wm
  WHERE ((wm.ws_id = '00000000-0000-0000-0000-000000000000'::uuid) AND (wm.user_id = auth.uid()) AND ((wm.role = 'ADMIN'::text) OR (wm.role = 'OWNER'::text))))));


create policy "Enable read access for all users"
on "public"."timezones"
as permissive
for select
to public
using (true);



