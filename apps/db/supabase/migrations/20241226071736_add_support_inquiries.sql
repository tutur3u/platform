create table "public"."support_inquiries" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "email" text not null,
    "subject" text not null,
    "message" text not null,
    "is_read" boolean not null default false,
    "is_resolved" boolean not null default false,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."support_inquiries" enable row level security;

CREATE UNIQUE INDEX support_inquiries_pkey ON public.support_inquiries USING btree (id);

alter table "public"."support_inquiries" add constraint "support_inquiries_pkey" PRIMARY KEY using index "support_inquiries_pkey";

grant delete on table "public"."support_inquiries" to "anon";

grant insert on table "public"."support_inquiries" to "anon";

grant references on table "public"."support_inquiries" to "anon";

grant select on table "public"."support_inquiries" to "anon";

grant trigger on table "public"."support_inquiries" to "anon";

grant truncate on table "public"."support_inquiries" to "anon";

grant update on table "public"."support_inquiries" to "anon";

grant delete on table "public"."support_inquiries" to "authenticated";

grant insert on table "public"."support_inquiries" to "authenticated";

grant references on table "public"."support_inquiries" to "authenticated";

grant select on table "public"."support_inquiries" to "authenticated";

grant trigger on table "public"."support_inquiries" to "authenticated";

grant truncate on table "public"."support_inquiries" to "authenticated";

grant update on table "public"."support_inquiries" to "authenticated";

grant delete on table "public"."support_inquiries" to "service_role";

grant insert on table "public"."support_inquiries" to "service_role";

grant references on table "public"."support_inquiries" to "service_role";

grant select on table "public"."support_inquiries" to "service_role";

grant trigger on table "public"."support_inquiries" to "service_role";

grant truncate on table "public"."support_inquiries" to "service_role";

grant update on table "public"."support_inquiries" to "service_role";

create policy "Allow Tuturuuu emails to have full access on inquiries"
on "public"."support_inquiries"
as permissive
for all
to authenticated
using (("substring"((auth.uid())::text, '@(.*)$'::text) = '@tuturuuu.com'::text))
with check (("substring"((auth.uid())::text, '@(.*)$'::text) = '@tuturuuu.com'::text));


create policy "Everyone can insert"
on "public"."support_inquiries"
as permissive
for insert
to public
with check (true);



