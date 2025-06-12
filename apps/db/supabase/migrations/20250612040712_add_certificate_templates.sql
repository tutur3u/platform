create type "public"."certificate_templates" as enum ('original', 'modern', 'elegant');

alter table "public"."workspace_courses" add column "cert_template" certificate_templates not null default 'original'::certificate_templates;


