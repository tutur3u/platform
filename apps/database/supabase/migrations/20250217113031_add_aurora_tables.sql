create table "public"."aurora_ml_forecast" (
  "id" uuid not null default gen_random_uuid(),
  "ws_id" uuid not null,
  "date" date not null,
  "elasticnet" real not null,
  "lightgbm" real not null,
  "xgboost" real not null,
  "catboost" real not null,
  "created_at" timestamp with time zone not null default now()
);

alter table
  "public"."aurora_ml_forecast" enable row level security;

create table "public"."aurora_ml_metrics" (
  "id" uuid not null default gen_random_uuid(),
  "ws_id" uuid not null,
  "model" text not null,
  "rmse" real not null,
  "directional_accuracy" real not null,
  "turning_point_accuracy" real not null,
  "weighted_score" real not null,
  "created_at" timestamp with time zone not null default now()
);

alter table
  "public"."aurora_ml_metrics" enable row level security;

create table "public"."aurora_statistical_forecast" (
  "id" uuid not null default gen_random_uuid(),
  "ws_id" uuid not null,
  "date" date not null,
  "auto_arima" real not null,
  "auto_arima_lo_90" real not null,
  "auto_arima_hi_90" real not null,
  "auto_ets" real not null,
  "auto_ets_lo_90" real not null,
  "auto_ets_hi_90" real not null,
  "auto_theta" real not null,
  "auto_theta_lo_90" real not null,
  "auto_theta_hi_90" real not null,
  "ces" real not null,
  "ces_lo_90" real not null,
  "ces_hi_90" real not null,
  "created_at" timestamp with time zone not null default now()
);

alter table
  "public"."aurora_statistical_forecast" enable row level security;

create table "public"."aurora_statistical_metrics" (
  "id" uuid not null default gen_random_uuid(),
  "ws_id" uuid not null,
  "model" text not null,
  "rmse" real not null,
  "directional_accuracy" real not null,
  "turning_point_accuracy" real not null,
  "weighted_score" real not null,
  "no_scaling" boolean not null,
  "created_at" timestamp with time zone not null default now()
);

alter table
  "public"."aurora_statistical_metrics" enable row level security;

CREATE UNIQUE INDEX aurora_ml_forecast_pkey ON public.aurora_ml_forecast USING btree (id);

CREATE UNIQUE INDEX aurora_ml_metrics_pkey ON public.aurora_ml_metrics USING btree (id);

CREATE UNIQUE INDEX aurora_statistical_forecast_pkey ON public.aurora_statistical_forecast USING btree (id);

CREATE UNIQUE INDEX aurora_statistical_metrics_pkey ON public.aurora_statistical_metrics USING btree (id);

alter table
  "public"."aurora_ml_forecast"
add
  constraint "aurora_ml_forecast_pkey" PRIMARY KEY using index "aurora_ml_forecast_pkey";

alter table
  "public"."aurora_ml_metrics"
add
  constraint "aurora_ml_metrics_pkey" PRIMARY KEY using index "aurora_ml_metrics_pkey";

alter table
  "public"."aurora_statistical_forecast"
add
  constraint "aurora_statistical_forecast_pkey" PRIMARY KEY using index "aurora_statistical_forecast_pkey";

alter table
  "public"."aurora_statistical_metrics"
add
  constraint "aurora_statistical_metrics_pkey" PRIMARY KEY using index "aurora_statistical_metrics_pkey";

alter table
  "public"."aurora_ml_forecast"
add
  constraint "aurora_ml_forecast_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
  "public"."aurora_ml_forecast" validate constraint "aurora_ml_forecast_ws_id_fkey";

alter table
  "public"."aurora_ml_metrics"
add
  constraint "aurora_ml_metrics_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
  "public"."aurora_ml_metrics" validate constraint "aurora_ml_metrics_ws_id_fkey";

alter table
  "public"."aurora_statistical_forecast"
add
  constraint "aurora_statistical_forecast_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
  "public"."aurora_statistical_forecast" validate constraint "aurora_statistical_forecast_ws_id_fkey";

alter table
  "public"."aurora_statistical_metrics"
add
  constraint "aurora_statistical_metrics_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
  "public"."aurora_statistical_metrics" validate constraint "aurora_statistical_metrics_ws_id_fkey";

grant delete on table "public"."aurora_ml_forecast" to "anon";

grant
insert
  on table "public"."aurora_ml_forecast" to "anon";

grant references on table "public"."aurora_ml_forecast" to "anon";

grant
select
  on table "public"."aurora_ml_forecast" to "anon";

grant trigger on table "public"."aurora_ml_forecast" to "anon";

grant truncate on table "public"."aurora_ml_forecast" to "anon";

grant
update
  on table "public"."aurora_ml_forecast" to "anon";

grant delete on table "public"."aurora_ml_forecast" to "authenticated";

grant
insert
  on table "public"."aurora_ml_forecast" to "authenticated";

grant references on table "public"."aurora_ml_forecast" to "authenticated";

grant
select
  on table "public"."aurora_ml_forecast" to "authenticated";

grant trigger on table "public"."aurora_ml_forecast" to "authenticated";

grant truncate on table "public"."aurora_ml_forecast" to "authenticated";

grant
update
  on table "public"."aurora_ml_forecast" to "authenticated";

grant delete on table "public"."aurora_ml_forecast" to "service_role";

grant
insert
  on table "public"."aurora_ml_forecast" to "service_role";

grant references on table "public"."aurora_ml_forecast" to "service_role";

grant
select
  on table "public"."aurora_ml_forecast" to "service_role";

grant trigger on table "public"."aurora_ml_forecast" to "service_role";

grant truncate on table "public"."aurora_ml_forecast" to "service_role";

grant
update
  on table "public"."aurora_ml_forecast" to "service_role";

grant delete on table "public"."aurora_ml_metrics" to "anon";

grant
insert
  on table "public"."aurora_ml_metrics" to "anon";

grant references on table "public"."aurora_ml_metrics" to "anon";

grant
select
  on table "public"."aurora_ml_metrics" to "anon";

grant trigger on table "public"."aurora_ml_metrics" to "anon";

grant truncate on table "public"."aurora_ml_metrics" to "anon";

grant
update
  on table "public"."aurora_ml_metrics" to "anon";

grant delete on table "public"."aurora_ml_metrics" to "authenticated";

grant
insert
  on table "public"."aurora_ml_metrics" to "authenticated";

grant references on table "public"."aurora_ml_metrics" to "authenticated";

grant
select
  on table "public"."aurora_ml_metrics" to "authenticated";

grant trigger on table "public"."aurora_ml_metrics" to "authenticated";

grant truncate on table "public"."aurora_ml_metrics" to "authenticated";

grant
update
  on table "public"."aurora_ml_metrics" to "authenticated";

grant delete on table "public"."aurora_ml_metrics" to "service_role";

grant
insert
  on table "public"."aurora_ml_metrics" to "service_role";

grant references on table "public"."aurora_ml_metrics" to "service_role";

grant
select
  on table "public"."aurora_ml_metrics" to "service_role";

grant trigger on table "public"."aurora_ml_metrics" to "service_role";

grant truncate on table "public"."aurora_ml_metrics" to "service_role";

grant
update
  on table "public"."aurora_ml_metrics" to "service_role";

grant delete on table "public"."aurora_statistical_forecast" to "anon";

grant
insert
  on table "public"."aurora_statistical_forecast" to "anon";

grant references on table "public"."aurora_statistical_forecast" to "anon";

grant
select
  on table "public"."aurora_statistical_forecast" to "anon";

grant trigger on table "public"."aurora_statistical_forecast" to "anon";

grant truncate on table "public"."aurora_statistical_forecast" to "anon";

grant
update
  on table "public"."aurora_statistical_forecast" to "anon";

grant delete on table "public"."aurora_statistical_forecast" to "authenticated";

grant
insert
  on table "public"."aurora_statistical_forecast" to "authenticated";

grant references on table "public"."aurora_statistical_forecast" to "authenticated";

grant
select
  on table "public"."aurora_statistical_forecast" to "authenticated";

grant trigger on table "public"."aurora_statistical_forecast" to "authenticated";

grant truncate on table "public"."aurora_statistical_forecast" to "authenticated";

grant
update
  on table "public"."aurora_statistical_forecast" to "authenticated";

grant delete on table "public"."aurora_statistical_forecast" to "service_role";

grant
insert
  on table "public"."aurora_statistical_forecast" to "service_role";

grant references on table "public"."aurora_statistical_forecast" to "service_role";

grant
select
  on table "public"."aurora_statistical_forecast" to "service_role";

grant trigger on table "public"."aurora_statistical_forecast" to "service_role";

grant truncate on table "public"."aurora_statistical_forecast" to "service_role";

grant
update
  on table "public"."aurora_statistical_forecast" to "service_role";

grant delete on table "public"."aurora_statistical_metrics" to "anon";

grant
insert
  on table "public"."aurora_statistical_metrics" to "anon";

grant references on table "public"."aurora_statistical_metrics" to "anon";

grant
select
  on table "public"."aurora_statistical_metrics" to "anon";

grant trigger on table "public"."aurora_statistical_metrics" to "anon";

grant truncate on table "public"."aurora_statistical_metrics" to "anon";

grant
update
  on table "public"."aurora_statistical_metrics" to "anon";

grant delete on table "public"."aurora_statistical_metrics" to "authenticated";

grant
insert
  on table "public"."aurora_statistical_metrics" to "authenticated";

grant references on table "public"."aurora_statistical_metrics" to "authenticated";

grant
select
  on table "public"."aurora_statistical_metrics" to "authenticated";

grant trigger on table "public"."aurora_statistical_metrics" to "authenticated";

grant truncate on table "public"."aurora_statistical_metrics" to "authenticated";

grant
update
  on table "public"."aurora_statistical_metrics" to "authenticated";

grant delete on table "public"."aurora_statistical_metrics" to "service_role";

grant
insert
  on table "public"."aurora_statistical_metrics" to "service_role";

grant references on table "public"."aurora_statistical_metrics" to "service_role";

grant
select
  on table "public"."aurora_statistical_metrics" to "service_role";

grant trigger on table "public"."aurora_statistical_metrics" to "service_role";

grant truncate on table "public"."aurora_statistical_metrics" to "service_role";

grant
update
  on table "public"."aurora_statistical_metrics" to "service_role";

create policy "Allow all for workspace members" on "public"."aurora_ml_forecast" as permissive for all to authenticated using (
  (
    EXISTS (
      SELECT
        1
      FROM
        workspaces w
      WHERE
        (w.id = aurora_ml_forecast.ws_id)
    )
  )
) with check (
  (
    EXISTS (
      SELECT
        1
      FROM
        workspaces w
      WHERE
        (w.id = aurora_ml_forecast.ws_id)
    )
  )
);

create policy "Allow all for workspace members" on "public"."aurora_ml_metrics" as permissive for all to authenticated using (
  (
    EXISTS (
      SELECT
        1
      FROM
        workspaces w
      WHERE
        (w.id = aurora_ml_metrics.ws_id)
    )
  )
) with check (
  (
    EXISTS (
      SELECT
        1
      FROM
        workspaces w
      WHERE
        (w.id = aurora_ml_metrics.ws_id)
    )
  )
);

create policy "Allow all for workspace members" on "public"."aurora_statistical_forecast" as permissive for all to authenticated using (
  (
    EXISTS (
      SELECT
        1
      FROM
        workspaces w
      WHERE
        (w.id = aurora_statistical_forecast.ws_id)
    )
  )
) with check (
  (
    EXISTS (
      SELECT
        1
      FROM
        workspaces w
      WHERE
        (w.id = aurora_statistical_forecast.ws_id)
    )
  )
);

create policy "Allow all for workspace members" on "public"."aurora_statistical_metrics" as permissive for all to public using (
  (
    EXISTS (
      SELECT
        1
      FROM
        workspaces w
      WHERE
        (w.id = aurora_statistical_metrics.ws_id)
    )
  )
) with check (
  (
    EXISTS (
      SELECT
        1
      FROM
        workspaces w
      WHERE
        (w.id = aurora_statistical_metrics.ws_id)
    )
  )
);