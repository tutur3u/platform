alter table "public"."course_certificates" alter column "id" set default (('CERT-'::text || to_char(now(), 'YYYY-MM-DD-'::text)) || (gen_random_uuid())::text);


