create type "public"."dataset_type" as enum ('excel', 'csv', 'html');

alter table "public"."workspace_datasets" add column "html_ids" text[];

alter table "public"."workspace_datasets" add column "type" dataset_type not null default 'excel'::dataset_type;


