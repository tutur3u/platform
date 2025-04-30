alter table "public"."users" add column "bio" text;

alter table "public"."users" add constraint "users_bio_check" CHECK (((length(bio) >= 10) AND (length(bio) <= 100))) not valid;

alter table "public"."users" validate constraint "users_bio_check";


