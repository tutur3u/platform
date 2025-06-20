alter table "public"."workspace_calendar_tasks" add column "description" text;

alter table "public"."workspace_calendar_tasks" add column "total_duration" text not null;

alter table "public"."workspace_calendar_tasks" alter column "max_split_duration_minutes" set data type real using "max_split_duration_minutes"::real;

alter table "public"."workspace_calendar_tasks" alter column "min_split_duration_minutes" set data type real using "min_split_duration_minutes"::real;


