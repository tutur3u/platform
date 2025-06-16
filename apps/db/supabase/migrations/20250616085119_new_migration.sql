alter table "public"."workspace_quiz_sets" drop column "release_points_immediately";

alter table "public"."workspace_quiz_sets" add column "allow_view_old_attempts" boolean not null default true;


