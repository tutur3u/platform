alter table "public"."inventory_products" drop constraint "inventory_products_amount_check";
create table "public"."workspace_secrets" (
    "id" uuid not null default gen_random_uuid(),
    "ws_id" uuid not null,
    "name" text not null default ''::text,
    "value" text,
    "created_at" timestamp with time zone not null default now()
);
alter table "public"."workspace_secrets" enable row level security;
CREATE UNIQUE INDEX workspace_external_api_configs_pkey ON public.workspace_secrets USING btree (id);
alter table "public"."workspace_secrets"
add constraint "workspace_external_api_configs_pkey" PRIMARY KEY using index "workspace_external_api_configs_pkey";
alter table "public"."workspace_secrets"
add constraint "workspace_secrets_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."workspace_secrets" validate constraint "workspace_secrets_ws_id_fkey";
alter table "public"."inventory_products"
add constraint "inventory_products_amount_check" CHECK (
        (
            (amount IS NULL)
            OR (amount IS NOT NULL)
        )
    ) not valid;
alter table "public"."inventory_products" validate constraint "inventory_products_amount_check";
create policy "Enable all access for workspace admin and owner" on "public"."workspace_secrets" as permissive for all to authenticated using (
    (
        (
            (get_user_role(auth.uid(), ws_id) = 'ADMIN'::text)
            OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text)
        )
        AND is_org_member(auth.uid(), ws_id)
    )
) with check (
    (
        (
            (get_user_role(auth.uid(), ws_id) = 'ADMIN'::text)
            OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text)
        )
        AND is_org_member(auth.uid(), ws_id)
    )
);