drop policy "Enable update access for authenticated users" on "public"."user_indicators";

CREATE UNIQUE INDEX user_indicators_pkey ON public.user_indicators USING btree (user_id, indicator_id);

CREATE UNIQUE INDEX user_indicators_unique_user_indicator ON public.user_indicators USING btree (user_id, indicator_id);

alter table "public"."user_indicators" add constraint "user_indicators_pkey" PRIMARY KEY using index "user_indicators_pkey";

alter table "public"."user_indicators" add constraint "user_indicators_unique_user_indicator" UNIQUE using index "user_indicators_unique_user_indicator";

create policy "Enable update access for authenticated users"
on "public"."user_indicators"
as permissive
for update
to authenticated
using (true)
with check (true);



