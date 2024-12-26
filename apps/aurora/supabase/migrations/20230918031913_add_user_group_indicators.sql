create table "public"."user_group_indicators" (
  "group_id" uuid not null,
  "indicator_id" uuid not null,
  "created_at" timestamp with time zone not null default now()
);
alter table "public"."user_group_indicators" enable row level security;
CREATE UNIQUE INDEX user_group_indicators_pkey ON public.user_group_indicators USING btree (group_id, indicator_id);
alter table "public"."user_group_indicators"
add constraint "user_group_indicators_pkey" PRIMARY KEY using index "user_group_indicators_pkey";
alter table "public"."user_group_indicators"
add constraint "user_group_indicators_group_id_fkey" FOREIGN KEY (group_id) REFERENCES workspace_user_groups(id) ON DELETE CASCADE not valid;
alter table "public"."user_group_indicators" validate constraint "user_group_indicators_group_id_fkey";
alter table "public"."user_group_indicators"
add constraint "user_group_indicators_indicator_id_fkey" FOREIGN KEY (indicator_id) REFERENCES healthcare_vitals(id) ON DELETE CASCADE not valid;
alter table "public"."user_group_indicators" validate constraint "user_group_indicators_indicator_id_fkey";
create policy "Allow all for workspace users" on "public"."user_group_indicators" as permissive for all to authenticated using (
  (
    (
      EXISTS (
        SELECT 1
        FROM workspace_user_groups g
        WHERE (g.id = user_group_indicators.group_id)
      )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM healthcare_vitals v
        WHERE (v.id = user_group_indicators.indicator_id)
      )
    )
  )
) with check (
  (
    (
      EXISTS (
        SELECT 1
        FROM workspace_user_groups g
        WHERE (g.id = user_group_indicators.group_id)
      )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM healthcare_vitals v
        WHERE (v.id = user_group_indicators.indicator_id)
      )
    )
  )
);