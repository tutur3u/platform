alter table "public"."tasks" alter column "user_defined_priority" drop default;

alter type "public"."task_priority" rename to "task_priority__old_version_to_be_dropped";

create type "public"."task_priority" as enum ('low', 'normal', 'high', 'critical');

-- Change column type first, before updating data
alter table "public"."tasks" alter column user_defined_priority type "public"."task_priority" using 
  case 
    when user_defined_priority::text = 'medium' then 'normal'::task_priority
    when user_defined_priority::text = 'urgent' then 'critical'::task_priority
    else user_defined_priority::text::task_priority
  end;

drop type "public"."task_priority__old_version_to_be_dropped";

alter table "public"."tasks" alter column "user_defined_priority" set default 'normal'::task_priority;


