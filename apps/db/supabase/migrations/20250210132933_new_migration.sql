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