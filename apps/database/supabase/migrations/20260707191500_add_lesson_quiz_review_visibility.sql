alter table "public"."workspace_course_modules"
  add column if not exists "is_quiz_score_published" boolean not null default false;

alter table "public"."course_module_quiz_submissions"
  alter column "is_correct" drop not null;

alter table "public"."course_module_quiz_submissions"
  add column if not exists "feedback" text;

update "public"."course_module_quiz_submissions" as submissions
set "is_correct" = null
from "public"."workspace_quizzes" as quizzes
where submissions."quiz_id" = quizzes."id"
  and quizzes."type" = 'paragraph';

create or replace function "private"."ensure_course_module_quiz_submission_grade_state"()
returns trigger
language plpgsql
as $$
declare
  quiz_type text;
begin
  if new."is_correct" is not null then
    return new;
  end if;

  select quizzes."type"
  into quiz_type
  from "public"."workspace_quizzes" as quizzes
  where quizzes."id" = new."quiz_id";

  if quiz_type is distinct from 'paragraph' then
    raise exception 'is_correct can only be null for paragraph quiz submissions'
      using errcode = '23514',
        constraint = 'course_module_quiz_submissions_is_correct_paragraph_null_check';
  end if;

  return new;
end;
$$;

create or replace function "private"."ensure_workspace_quiz_type_grade_state"()
returns trigger
language plpgsql
as $$
begin
  if new."type" = 'paragraph' then
    return new;
  end if;

  if exists (
    select 1
    from "public"."course_module_quiz_submissions" as submissions
    where submissions."quiz_id" = new."id"
      and submissions."is_correct" is null
  ) then
    raise exception 'quiz type cannot become objective while submissions have null is_correct'
      using errcode = '23514',
        constraint = 'workspace_quizzes_type_null_submission_check';
  end if;

  return new;
end;
$$;

drop trigger if exists "course_module_quiz_submissions_grade_state_check"
on "public"."course_module_quiz_submissions";

create trigger "course_module_quiz_submissions_grade_state_check"
before insert or update of "quiz_id", "is_correct"
on "public"."course_module_quiz_submissions"
for each row
execute function "private"."ensure_course_module_quiz_submission_grade_state"();

drop trigger if exists "workspace_quizzes_grade_state_check"
on "public"."workspace_quizzes";

create trigger "workspace_quizzes_grade_state_check"
before update of "type"
on "public"."workspace_quizzes"
for each row
when (old."type" is distinct from new."type")
execute function "private"."ensure_workspace_quiz_type_grade_state"();
