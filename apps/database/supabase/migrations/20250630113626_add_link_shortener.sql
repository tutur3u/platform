create table "public"."shortened_links" (
    "id" uuid not null default gen_random_uuid(),
    "link" text not null,
    "slug" text not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."shortened_links" enable row level security;

CREATE UNIQUE INDEX shortened_links_pkey ON public.shortened_links USING btree (id);

CREATE UNIQUE INDEX shortened_links_slug_key ON public.shortened_links USING btree (slug);

alter table "public"."shortened_links" add constraint "shortened_links_pkey" PRIMARY KEY using index "shortened_links_pkey";

alter table "public"."shortened_links" add constraint "shortened_links_slug_key" UNIQUE using index "shortened_links_slug_key";

grant delete on table "public"."shortened_links" to "anon";

grant insert on table "public"."shortened_links" to "anon";

grant references on table "public"."shortened_links" to "anon";

grant select on table "public"."shortened_links" to "anon";

grant trigger on table "public"."shortened_links" to "anon";

grant truncate on table "public"."shortened_links" to "anon";

grant update on table "public"."shortened_links" to "anon";

grant delete on table "public"."shortened_links" to "authenticated";

grant insert on table "public"."shortened_links" to "authenticated";

grant references on table "public"."shortened_links" to "authenticated";

grant select on table "public"."shortened_links" to "authenticated";

grant trigger on table "public"."shortened_links" to "authenticated";

grant truncate on table "public"."shortened_links" to "authenticated";

grant update on table "public"."shortened_links" to "authenticated";

grant delete on table "public"."shortened_links" to "service_role";

grant insert on table "public"."shortened_links" to "service_role";

grant references on table "public"."shortened_links" to "service_role";

grant select on table "public"."shortened_links" to "service_role";

grant trigger on table "public"."shortened_links" to "service_role";

grant truncate on table "public"."shortened_links" to "service_role";

grant update on table "public"."shortened_links" to "service_role";


-- Allow authenticated users with @tuturuuu.com emails to manage shortened links
-- This ensures only team members can create and view shortened links
CREATE POLICY "Allow team members to insert shortened links" ON "public"."shortened_links"
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.email LIKE '%@tuturuuu.com'
    )
  );

CREATE POLICY "Allow team members to select shortened links" ON "public"."shortened_links"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.email LIKE '%@tuturuuu.com'
    )
  );

alter table "public"."shortened_links" add column "creator_id" uuid;

alter table "public"."shortened_links" add constraint "shortened_links_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."shortened_links" validate constraint "shortened_links_creator_id_fkey";