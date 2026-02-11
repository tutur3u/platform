create type "public"."feature_flag" as enum ('ENABLE_AI', 'ENABLE_EDUCATION', 'ENABLE_CHALLENGES', 'ENABLE_QUIZZES');

drop index if exists "public"."workspace_education_access_requests_unique_pending";

alter table "public"."workspace_education_access_requests" add column "feature" "feature_flag" not null default 'ENABLE_EDUCATION'::"feature_flag";

CREATE UNIQUE INDEX workspace_education_access_requests_unique_pending ON public.workspace_education_access_requests USING btree (ws_id, feature) WHERE (status = 'pending'::text);


