create table "public"."workspace_documents_block" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "document_id" uuid default gen_random_uuid(),
    "type" text,
    "content" text
);


alter table "public"."workspace_documents_block" enable row level security;

create table "public"."workspace_documents_block_attributes" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "block_id" uuid default gen_random_uuid(),
    "attribute_key" text not null,
    "attribute_value" text not null
);


alter table "public"."workspace_documents_block_attributes" enable row level security;

alter table "public"."workspace_documents" disable row level security;

CREATE UNIQUE INDEX workspace_documents_block_attributes_pkey ON public.workspace_documents_block_attributes USING btree (id);

CREATE UNIQUE INDEX workspace_documents_block_pkey ON public.workspace_documents_block USING btree (id);

alter table "public"."workspace_documents_block" add constraint "workspace_documents_block_pkey" PRIMARY KEY using index "workspace_documents_block_pkey";

alter table "public"."workspace_documents_block_attributes" add constraint "workspace_documents_block_attributes_pkey" PRIMARY KEY using index "workspace_documents_block_attributes_pkey";

alter table "public"."workspace_documents_block" add constraint "workspace_documents_block_document_id_fkey" FOREIGN KEY (document_id) REFERENCES workspace_documents(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_documents_block" validate constraint "workspace_documents_block_document_id_fkey";

alter table "public"."workspace_documents_block_attributes" add constraint "workspace_documents_block_attributes_block_id_fkey" FOREIGN KEY (block_id) REFERENCES workspace_documents_block(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_documents_block_attributes" validate constraint "workspace_documents_block_attributes_block_id_fkey";

grant delete on table "public"."workspace_documents_block" to "anon";

grant insert on table "public"."workspace_documents_block" to "anon";

grant references on table "public"."workspace_documents_block" to "anon";

grant select on table "public"."workspace_documents_block" to "anon";

grant trigger on table "public"."workspace_documents_block" to "anon";

grant truncate on table "public"."workspace_documents_block" to "anon";

grant update on table "public"."workspace_documents_block" to "anon";

grant delete on table "public"."workspace_documents_block" to "authenticated";

grant insert on table "public"."workspace_documents_block" to "authenticated";

grant references on table "public"."workspace_documents_block" to "authenticated";

grant select on table "public"."workspace_documents_block" to "authenticated";

grant trigger on table "public"."workspace_documents_block" to "authenticated";

grant truncate on table "public"."workspace_documents_block" to "authenticated";

grant update on table "public"."workspace_documents_block" to "authenticated";

grant delete on table "public"."workspace_documents_block" to "service_role";

grant insert on table "public"."workspace_documents_block" to "service_role";

grant references on table "public"."workspace_documents_block" to "service_role";

grant select on table "public"."workspace_documents_block" to "service_role";

grant trigger on table "public"."workspace_documents_block" to "service_role";

grant truncate on table "public"."workspace_documents_block" to "service_role";

grant update on table "public"."workspace_documents_block" to "service_role";

grant delete on table "public"."workspace_documents_block_attributes" to "anon";

grant insert on table "public"."workspace_documents_block_attributes" to "anon";

grant references on table "public"."workspace_documents_block_attributes" to "anon";

grant select on table "public"."workspace_documents_block_attributes" to "anon";

grant trigger on table "public"."workspace_documents_block_attributes" to "anon";

grant truncate on table "public"."workspace_documents_block_attributes" to "anon";

grant update on table "public"."workspace_documents_block_attributes" to "anon";

grant delete on table "public"."workspace_documents_block_attributes" to "authenticated";

grant insert on table "public"."workspace_documents_block_attributes" to "authenticated";

grant references on table "public"."workspace_documents_block_attributes" to "authenticated";

grant select on table "public"."workspace_documents_block_attributes" to "authenticated";

grant trigger on table "public"."workspace_documents_block_attributes" to "authenticated";

grant truncate on table "public"."workspace_documents_block_attributes" to "authenticated";

grant update on table "public"."workspace_documents_block_attributes" to "authenticated";

grant delete on table "public"."workspace_documents_block_attributes" to "service_role";

grant insert on table "public"."workspace_documents_block_attributes" to "service_role";

grant references on table "public"."workspace_documents_block_attributes" to "service_role";

grant select on table "public"."workspace_documents_block_attributes" to "service_role";

grant trigger on table "public"."workspace_documents_block_attributes" to "service_role";

grant truncate on table "public"."workspace_documents_block_attributes" to "service_role";

grant update on table "public"."workspace_documents_block_attributes" to "service_role";


