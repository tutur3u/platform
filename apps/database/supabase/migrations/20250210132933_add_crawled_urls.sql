alter table
    "public"."workspace_datasets" drop column "html_ids";

alter table
    "public"."workspace_datasets" drop column "type";

alter table
    "public"."workspace_datasets" drop column "url";

create table "public"."workspace_crawlers" (
    "id" uuid not null default gen_random_uuid(),
    "ws_id" uuid not null,
    "url" text not null,
    "html_ids" text [] not null,
    "created_at" timestamp with time zone not null default now(),
    "dataset_id" uuid
);

alter table
    "public"."workspace_crawlers" enable row level security;

CREATE UNIQUE INDEX workspace_crawlers_pkey ON public.workspace_crawlers USING btree (id);

alter table
    "public"."workspace_crawlers"
add
    constraint "workspace_crawlers_pkey" PRIMARY KEY using index "workspace_crawlers_pkey";

alter table
    "public"."workspace_crawlers"
add
    constraint "workspace_crawlers_dataset_id_fkey" FOREIGN KEY (dataset_id) REFERENCES workspace_datasets(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
    "public"."workspace_crawlers" validate constraint "workspace_crawlers_dataset_id_fkey";

alter table
    "public"."workspace_crawlers"
add
    constraint "workspace_crawlers_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
    "public"."workspace_crawlers" validate constraint "workspace_crawlers_ws_id_fkey";

grant delete on table "public"."workspace_crawlers" to "anon";

grant
insert
    on table "public"."workspace_crawlers" to "anon";

grant references on table "public"."workspace_crawlers" to "anon";

grant
select
    on table "public"."workspace_crawlers" to "anon";

grant trigger on table "public"."workspace_crawlers" to "anon";

grant truncate on table "public"."workspace_crawlers" to "anon";

grant
update
    on table "public"."workspace_crawlers" to "anon";

grant delete on table "public"."workspace_crawlers" to "authenticated";

grant
insert
    on table "public"."workspace_crawlers" to "authenticated";

grant references on table "public"."workspace_crawlers" to "authenticated";

grant
select
    on table "public"."workspace_crawlers" to "authenticated";

grant trigger on table "public"."workspace_crawlers" to "authenticated";

grant truncate on table "public"."workspace_crawlers" to "authenticated";

grant
update
    on table "public"."workspace_crawlers" to "authenticated";

grant delete on table "public"."workspace_crawlers" to "service_role";

grant
insert
    on table "public"."workspace_crawlers" to "service_role";

grant references on table "public"."workspace_crawlers" to "service_role";

grant
select
    on table "public"."workspace_crawlers" to "service_role";

grant trigger on table "public"."workspace_crawlers" to "service_role";

grant truncate on table "public"."workspace_crawlers" to "service_role";

grant
update
    on table "public"."workspace_crawlers" to "service_role";

create policy "Allow workspace members to have full permissions" on "public"."workspace_crawlers" as permissive for all to authenticated using (
    (
        EXISTS (
            SELECT
                1
            FROM
                workspaces ws
            WHERE
                (ws.id = workspace_crawlers.ws_id)
        )
    )
) with check (
    (
        EXISTS (
            SELECT
                1
            FROM
                workspaces ws
            WHERE
                (ws.id = workspace_crawlers.ws_id)
        )
    )
);

create table "public"."crawled_url_next_urls" (
    "origin_id" uuid not null default gen_random_uuid(),
    "url" text not null,
    "skipped" boolean not null,
    "created_at" timestamp with time zone not null default now()
);

create table "public"."crawled_urls" (
    "id" uuid not null default gen_random_uuid(),
    "url" text not null,
    "html" text,
    "markdown" text,
    "created_at" timestamp with time zone not null default now()
);

CREATE UNIQUE INDEX crawled_url_next_urls_pkey ON public.crawled_url_next_urls USING btree (origin_id, url);

CREATE UNIQUE INDEX crawled_urls_pkey ON public.crawled_urls USING btree (id);

alter table
    "public"."crawled_url_next_urls"
add
    constraint "crawled_url_next_urls_pkey" PRIMARY KEY using index "crawled_url_next_urls_pkey";

alter table
    "public"."crawled_urls"
add
    constraint "crawled_urls_pkey" PRIMARY KEY using index "crawled_urls_pkey";

grant delete on table "public"."crawled_url_next_urls" to "anon";

grant
insert
    on table "public"."crawled_url_next_urls" to "anon";

grant references on table "public"."crawled_url_next_urls" to "anon";

grant
select
    on table "public"."crawled_url_next_urls" to "anon";

grant trigger on table "public"."crawled_url_next_urls" to "anon";

grant truncate on table "public"."crawled_url_next_urls" to "anon";

grant
update
    on table "public"."crawled_url_next_urls" to "anon";

grant delete on table "public"."crawled_url_next_urls" to "authenticated";

grant
insert
    on table "public"."crawled_url_next_urls" to "authenticated";

grant references on table "public"."crawled_url_next_urls" to "authenticated";

grant
select
    on table "public"."crawled_url_next_urls" to "authenticated";

grant trigger on table "public"."crawled_url_next_urls" to "authenticated";

grant truncate on table "public"."crawled_url_next_urls" to "authenticated";

grant
update
    on table "public"."crawled_url_next_urls" to "authenticated";

grant delete on table "public"."crawled_url_next_urls" to "service_role";

grant
insert
    on table "public"."crawled_url_next_urls" to "service_role";

grant references on table "public"."crawled_url_next_urls" to "service_role";

grant
select
    on table "public"."crawled_url_next_urls" to "service_role";

grant trigger on table "public"."crawled_url_next_urls" to "service_role";

grant truncate on table "public"."crawled_url_next_urls" to "service_role";

grant
update
    on table "public"."crawled_url_next_urls" to "service_role";

grant delete on table "public"."crawled_urls" to "anon";

grant
insert
    on table "public"."crawled_urls" to "anon";

grant references on table "public"."crawled_urls" to "anon";

grant
select
    on table "public"."crawled_urls" to "anon";

grant trigger on table "public"."crawled_urls" to "anon";

grant truncate on table "public"."crawled_urls" to "anon";

grant
update
    on table "public"."crawled_urls" to "anon";

grant delete on table "public"."crawled_urls" to "authenticated";

grant
insert
    on table "public"."crawled_urls" to "authenticated";

grant references on table "public"."crawled_urls" to "authenticated";

grant
select
    on table "public"."crawled_urls" to "authenticated";

grant trigger on table "public"."crawled_urls" to "authenticated";

grant truncate on table "public"."crawled_urls" to "authenticated";

grant
update
    on table "public"."crawled_urls" to "authenticated";

grant delete on table "public"."crawled_urls" to "service_role";

grant
insert
    on table "public"."crawled_urls" to "service_role";

grant references on table "public"."crawled_urls" to "service_role";

grant
select
    on table "public"."crawled_urls" to "service_role";

grant trigger on table "public"."crawled_urls" to "service_role";

grant truncate on table "public"."crawled_urls" to "service_role";

grant
update
    on table "public"."crawled_urls" to "service_role";

drop policy "Allow workspace members to have full permissions" on "public"."workspace_crawlers";

revoke delete on table "public"."workspace_crawlers"
from
    "anon";

revoke
insert
    on table "public"."workspace_crawlers"
from
    "anon";

revoke references on table "public"."workspace_crawlers"
from
    "anon";

revoke
select
    on table "public"."workspace_crawlers"
from
    "anon";

revoke trigger on table "public"."workspace_crawlers"
from
    "anon";

revoke truncate on table "public"."workspace_crawlers"
from
    "anon";

revoke
update
    on table "public"."workspace_crawlers"
from
    "anon";

revoke delete on table "public"."workspace_crawlers"
from
    "authenticated";

revoke
insert
    on table "public"."workspace_crawlers"
from
    "authenticated";

revoke references on table "public"."workspace_crawlers"
from
    "authenticated";

revoke
select
    on table "public"."workspace_crawlers"
from
    "authenticated";

revoke trigger on table "public"."workspace_crawlers"
from
    "authenticated";

revoke truncate on table "public"."workspace_crawlers"
from
    "authenticated";

revoke
update
    on table "public"."workspace_crawlers"
from
    "authenticated";

revoke delete on table "public"."workspace_crawlers"
from
    "service_role";

revoke
insert
    on table "public"."workspace_crawlers"
from
    "service_role";

revoke references on table "public"."workspace_crawlers"
from
    "service_role";

revoke
select
    on table "public"."workspace_crawlers"
from
    "service_role";

revoke trigger on table "public"."workspace_crawlers"
from
    "service_role";

revoke truncate on table "public"."workspace_crawlers"
from
    "service_role";

revoke
update
    on table "public"."workspace_crawlers"
from
    "service_role";

alter table
    "public"."workspace_crawlers" drop constraint "workspace_crawlers_dataset_id_fkey";

alter table
    "public"."workspace_crawlers" drop constraint "workspace_crawlers_ws_id_fkey";

alter table
    "public"."workspace_crawlers" drop constraint "workspace_crawlers_pkey";

drop index if exists "public"."workspace_crawlers_pkey";

drop table "public"."workspace_crawlers";

alter table
    "public"."crawled_url_next_urls" enable row level security;

alter table
    "public"."crawled_urls"
add
    column "creator_id" uuid not null;

alter table
    "public"."crawled_urls" enable row level security;

alter table
    "public"."crawled_url_next_urls"
add
    constraint "crawled_url_next_urls_origin_id_fkey" FOREIGN KEY (origin_id) REFERENCES crawled_urls(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
    "public"."crawled_url_next_urls" validate constraint "crawled_url_next_urls_origin_id_fkey";

alter table
    "public"."crawled_urls"
add
    constraint "crawled_urls_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE not valid;

alter table
    "public"."crawled_urls" validate constraint "crawled_urls_creator_id_fkey";

create policy "Denies all requests" on "public"."crawled_url_next_urls" as permissive for all to authenticated using (false) with check (false);

create policy "Denies all requests" on "public"."crawled_urls" as permissive for all to authenticated using (false) with check (false);