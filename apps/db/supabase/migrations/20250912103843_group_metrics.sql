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

create policy "Enable read access for authenticated users" on "public"."user_indicators" as permissive for select to authenticated using (true);

create policy "Enable insert access for authenticated users" on "public"."user_indicators" as permissive for insert to authenticated with check (true);

create policy "Enable update access for authenticated users" on "public"."user_indicators" as permissive for update to authenticated with check (true);

create policy "Enable delete access for authenticated users" on "public"."user_indicators" as permissive for delete to authenticated using (true);






