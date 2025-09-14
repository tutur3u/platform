drop policy "Allow all for workspace users" on "public"."user_group_indicators";

drop policy "Allow all for workspace users" on "public"."user_indicators";

revoke delete on table "public"."user_group_indicators" from "anon";

revoke insert on table "public"."user_group_indicators" from "anon";

revoke references on table "public"."user_group_indicators" from "anon";

revoke select on table "public"."user_group_indicators" from "anon";

revoke trigger on table "public"."user_group_indicators" from "anon";

revoke truncate on table "public"."user_group_indicators" from "anon";

revoke update on table "public"."user_group_indicators" from "anon";

revoke delete on table "public"."user_group_indicators" from "authenticated";

revoke insert on table "public"."user_group_indicators" from "authenticated";

revoke references on table "public"."user_group_indicators" from "authenticated";

revoke select on table "public"."user_group_indicators" from "authenticated";

revoke trigger on table "public"."user_group_indicators" from "authenticated";

revoke truncate on table "public"."user_group_indicators" from "authenticated";

revoke update on table "public"."user_group_indicators" from "authenticated";

revoke delete on table "public"."user_group_indicators" from "service_role";

revoke insert on table "public"."user_group_indicators" from "service_role";

revoke references on table "public"."user_group_indicators" from "service_role";

revoke select on table "public"."user_group_indicators" from "service_role";

revoke trigger on table "public"."user_group_indicators" from "service_role";

revoke truncate on table "public"."user_group_indicators" from "service_role";

revoke update on table "public"."user_group_indicators" from "service_role";

alter table "public"."user_group_indicators" drop constraint "user_group_indicators_group_id_fkey";

alter table "public"."user_group_indicators" drop constraint "user_group_indicators_indicator_id_fkey";

alter table "public"."user_indicators" drop constraint "user_indicators_group_id_fkey";

alter table "public"."user_group_indicators" drop constraint "user_group_indicators_pkey";


alter table "public"."user_indicators" drop constraint "user_indicators_pkey";

drop index if exists "public"."user_group_indicators_pkey";

drop index if exists "public"."user_indicators_pkey";

drop table "public"."user_group_indicators";

alter table "public"."user_indicators" drop column "group_id";

CREATE UNIQUE INDEX user_indicators_unique_user_indicator ON public.user_indicators USING btree (user_id, indicator_id);

alter table "public"."user_indicators" add constraint "user_indicators_unique_user_indicator" UNIQUE using index "user_indicators_unique_user_indicator";


CREATE UNIQUE INDEX user_indicators_pkey ON public.user_indicators USING btree (user_id, indicator_id);

alter table "public"."user_indicators" add constraint "user_indicators_pkey" PRIMARY KEY using index "user_indicators_pkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.can_manage_indicator(p_indicator_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$SELECT EXISTS (
    SELECT 1
    FROM healthcare_vitals hv
    WHERE hv.id = p_indicator_id
      AND is_org_member(auth.uid(), hv.ws_id)
  );$function$
;


create policy "Allow full CRUD for workspace members via indicator"
on "public"."user_indicators"
as permissive
for all
to authenticated
using (can_manage_indicator(indicator_id))
with check (can_manage_indicator(indicator_id));











