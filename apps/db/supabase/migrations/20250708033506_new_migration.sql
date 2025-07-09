alter table "public"."tasks" alter column "user_defined_priority" drop default;

alter type "public"."task_priority" rename to "task_priority__old_version_to_be_dropped";

create type "public"."task_priority" as enum ('low', 'normal', 'high', 'critical');

alter table "public"."tasks" alter column user_defined_priority type "public"."task_priority" using user_defined_priority::text::"public"."task_priority";

drop type "public"."task_priority__old_version_to_be_dropped";

alter table "public"."tasks" alter column "user_defined_priority" set default 'normal'::task_priority;


