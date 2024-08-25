create table "public"."user_feedbacks" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null,
  "group_id" uuid,
  "content" text not null,
  "creator_id" uuid,
  "require_attention" boolean not null default false,
  "created_at" timestamp with time zone not null default now()
);
alter table "public"."user_feedbacks" enable row level security;
create table "public"."user_group_attendance" (
  "group_id" uuid not null,
  "user_id" uuid not null,
  "date" date not null,
  "status" text not null,
  "notes" text not null default ''::text,
  "created_at" timestamp with time zone not null default now()
);
alter table "public"."user_group_attendance" enable row level security;
create table "public"."user_group_linked_products" (
  "group_id" uuid not null,
  "product_id" uuid not null,
  "unit_id" uuid not null,
  "created_at" timestamp with time zone not null default now()
);
alter table "public"."user_group_linked_products" enable row level security;
create table "public"."user_group_posts" (
  "id" uuid not null default gen_random_uuid(),
  "group_id" uuid not null,
  "title" text default ''::text,
  "content" text default ''::text,
  "notes" text default ''::text,
  "created_at" timestamp with time zone not null default now()
);
alter table "public"."user_group_posts" enable row level security;
create table "public"."workspace_promotions" (
  "id" uuid not null default gen_random_uuid(),
  "name" text default ''::text,
  "description" text default ''::text,
  "value" integer not null,
  "use_ratio" boolean not null default false,
  "code" text default ''::text,
  "created_at" timestamp with time zone not null default now(),
  "ws_id" uuid not null
);
alter table "public"."workspace_promotions" enable row level security;
CREATE UNIQUE INDEX user_feedbacks_pkey ON public.user_feedbacks USING btree (id);
CREATE UNIQUE INDEX user_group_attendance_pkey ON public.user_group_attendance USING btree (group_id, user_id, date);
CREATE UNIQUE INDEX user_group_linked_products_pkey ON public.user_group_linked_products USING btree (group_id, product_id, unit_id);
CREATE UNIQUE INDEX user_group_posts_pkey ON public.user_group_posts USING btree (id);
CREATE UNIQUE INDEX workspace_promotions_pkey ON public.workspace_promotions USING btree (id);
alter table "public"."user_feedbacks"
add constraint "user_feedbacks_pkey" PRIMARY KEY using index "user_feedbacks_pkey";
alter table "public"."user_group_attendance"
add constraint "user_group_attendance_pkey" PRIMARY KEY using index "user_group_attendance_pkey";
alter table "public"."user_group_linked_products"
add constraint "user_group_linked_products_pkey" PRIMARY KEY using index "user_group_linked_products_pkey";
alter table "public"."user_group_posts"
add constraint "user_group_posts_pkey" PRIMARY KEY using index "user_group_posts_pkey";
alter table "public"."workspace_promotions"
add constraint "workspace_promotions_pkey" PRIMARY KEY using index "workspace_promotions_pkey";
alter table "public"."user_feedbacks"
add constraint "user_feedbacks_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) not valid;
alter table "public"."user_feedbacks" validate constraint "user_feedbacks_creator_id_fkey";
alter table "public"."user_feedbacks"
add constraint "user_feedbacks_group_id_fkey" FOREIGN KEY (group_id) REFERENCES workspace_user_groups(id) ON DELETE CASCADE not valid;
alter table "public"."user_feedbacks" validate constraint "user_feedbacks_group_id_fkey";
alter table "public"."user_feedbacks"
add constraint "user_feedbacks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES workspace_users(id) ON DELETE CASCADE not valid;
alter table "public"."user_feedbacks" validate constraint "user_feedbacks_user_id_fkey";
alter table "public"."user_group_attendance"
add constraint "user_group_attendance_group_id_fkey" FOREIGN KEY (group_id) REFERENCES workspace_user_groups(id) ON DELETE CASCADE not valid;
alter table "public"."user_group_attendance" validate constraint "user_group_attendance_group_id_fkey";
alter table "public"."user_group_attendance"
add constraint "user_group_attendance_user_id_fkey" FOREIGN KEY (user_id) REFERENCES workspace_users(id) ON DELETE CASCADE not valid;
alter table "public"."user_group_attendance" validate constraint "user_group_attendance_user_id_fkey";
alter table "public"."user_group_linked_products"
add constraint "user_group_linked_products_group_id_fkey" FOREIGN KEY (group_id) REFERENCES workspace_user_groups(id) ON DELETE CASCADE not valid;
alter table "public"."user_group_linked_products" validate constraint "user_group_linked_products_group_id_fkey";
alter table "public"."user_group_linked_products"
add constraint "user_group_linked_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES workspace_products(id) ON DELETE CASCADE not valid;
alter table "public"."user_group_linked_products" validate constraint "user_group_linked_products_product_id_fkey";
alter table "public"."user_group_linked_products"
add constraint "user_group_linked_products_unit_id_fkey" FOREIGN KEY (unit_id) REFERENCES inventory_units(id) ON DELETE CASCADE not valid;
alter table "public"."user_group_linked_products" validate constraint "user_group_linked_products_unit_id_fkey";
alter table "public"."user_group_posts"
add constraint "user_group_posts_group_id_fkey" FOREIGN KEY (group_id) REFERENCES workspace_user_groups(id) ON DELETE CASCADE not valid;
alter table "public"."user_group_posts" validate constraint "user_group_posts_group_id_fkey";
alter table "public"."workspace_promotions"
add constraint "workspace_promotions_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE not valid;
alter table "public"."workspace_promotions" validate constraint "workspace_promotions_ws_id_fkey";
create policy "Allow access for workspace users" on "public"."user_feedbacks" as permissive for all to authenticated using (
  (
    (
      EXISTS (
        SELECT 1
        FROM workspace_users u
        WHERE (u.id = user_feedbacks.user_id)
      )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM workspace_user_groups g
        WHERE (g.id = user_feedbacks.group_id)
      )
    )
  )
) with check (
  (
    (
      EXISTS (
        SELECT 1
        FROM workspace_users u
        WHERE (u.id = user_feedbacks.user_id)
      )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM workspace_user_groups g
        WHERE (g.id = user_feedbacks.group_id)
      )
    )
  )
);
create policy "Allow access for workspace users" on "public"."user_group_attendance" as permissive for all to authenticated using (
  (
    (
      EXISTS (
        SELECT 1
        FROM workspace_users u
        WHERE (u.id = user_group_attendance.user_id)
      )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM workspace_user_groups g
        WHERE (g.id = user_group_attendance.group_id)
      )
    )
  )
) with check (
  (
    (
      EXISTS (
        SELECT 1
        FROM workspace_users u
        WHERE (u.id = user_group_attendance.user_id)
      )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM workspace_user_groups g
        WHERE (g.id = user_group_attendance.group_id)
      )
    )
  )
);
create policy "Allow access for workspace users" on "public"."user_group_linked_products" as permissive for all to authenticated using (
  (
    (
      EXISTS (
        SELECT 1
        FROM workspace_user_groups g
        WHERE (g.id = user_group_linked_products.group_id)
      )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM workspace_products p
        WHERE (p.id = user_group_linked_products.product_id)
      )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM inventory_units u
        WHERE (u.id = user_group_linked_products.unit_id)
      )
    )
  )
) with check (
  (
    (
      EXISTS (
        SELECT 1
        FROM workspace_user_groups g
        WHERE (g.id = user_group_linked_products.group_id)
      )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM workspace_products p
        WHERE (p.id = user_group_linked_products.product_id)
      )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM inventory_units u
        WHERE (u.id = user_group_linked_products.unit_id)
      )
    )
  )
);
create policy "Allow access for workspace users" on "public"."user_group_posts" as permissive for all to authenticated using (
  (
    EXISTS (
      SELECT 1
      FROM workspace_user_groups g
      WHERE (g.id = user_group_posts.group_id)
    )
  )
) with check (
  (
    EXISTS (
      SELECT 1
      FROM workspace_user_groups g
      WHERE (g.id = user_group_posts.group_id)
    )
  )
);
create policy "Enable all access for workspace members" on "public"."workspace_promotions" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));
create table "public"."user_linked_promotions" (
  "user_id" uuid not null,
  "promo_id" uuid not null,
  "created_at" timestamp with time zone not null default now()
);
alter table "public"."user_linked_promotions" enable row level security;
CREATE UNIQUE INDEX user_linked_promotions_pkey ON public.user_linked_promotions USING btree (user_id, promo_id);
alter table "public"."user_linked_promotions"
add constraint "user_linked_promotions_pkey" PRIMARY KEY using index "user_linked_promotions_pkey";
alter table "public"."user_linked_promotions"
add constraint "user_linked_promotions_promo_id_fkey" FOREIGN KEY (promo_id) REFERENCES workspace_promotions(id) ON DELETE CASCADE not valid;
alter table "public"."user_linked_promotions" validate constraint "user_linked_promotions_promo_id_fkey";
alter table "public"."user_linked_promotions"
add constraint "user_linked_promotions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES workspace_users(id) ON DELETE CASCADE not valid;
alter table "public"."user_linked_promotions" validate constraint "user_linked_promotions_user_id_fkey";
create policy "Enable all access for workspace members" on "public"."user_linked_promotions" as permissive for all to authenticated using (
  (
    (
      EXISTS (
        SELECT 1
        FROM workspace_promotions p
        WHERE (p.id = user_linked_promotions.promo_id)
      )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM workspace_users u
        WHERE (u.id = user_linked_promotions.user_id)
      )
    )
  )
) with check (
  (
    (
      EXISTS (
        SELECT 1
        FROM workspace_promotions p
        WHERE (p.id = user_linked_promotions.promo_id)
      )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM workspace_users u
        WHERE (u.id = user_linked_promotions.user_id)
      )
    )
  )
);
drop policy "Enable delete for users based on user_id" on "public"."workspaces";
alter table "public"."healthcare_diagnoses" drop constraint "healthcare_diagnoses_ws_id_fkey";
alter table "public"."healthcare_vital_groups" drop constraint "healthcare_vital_groups_ws_id_fkey";
alter table "public"."healthcare_vitals" drop constraint "healthcare_vitals_ws_id_fkey";
alter table "public"."inventory_batches" drop constraint "inventory_batches_supplier_id_fkey";
alter table "public"."inventory_batches" drop constraint "inventory_batches_warehouse_id_fkey";
alter table "public"."inventory_suppliers" drop constraint "inventory_suppliers_ws_id_fkey";
alter table "public"."inventory_units" drop constraint "inventory_units_ws_id_fkey";
alter table "public"."inventory_warehouses" drop constraint "inventory_warehouses_ws_id_fkey";
alter table "public"."vital_group_vitals" drop constraint "vital_group_vitals_group_id_fkey";
alter table "public"."vital_group_vitals" drop constraint "vital_group_vitals_vital_id_fkey";
alter table "public"."workspace_users" drop constraint "workspace_users_ws_id_fkey";
alter table "public"."healthcare_diagnoses"
add constraint "healthcare_diagnoses_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE not valid;
alter table "public"."healthcare_diagnoses" validate constraint "healthcare_diagnoses_ws_id_fkey";
alter table "public"."healthcare_vital_groups"
add constraint "healthcare_vital_groups_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE not valid;
alter table "public"."healthcare_vital_groups" validate constraint "healthcare_vital_groups_ws_id_fkey";
alter table "public"."healthcare_vitals"
add constraint "healthcare_vitals_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE not valid;
alter table "public"."healthcare_vitals" validate constraint "healthcare_vitals_ws_id_fkey";
alter table "public"."inventory_batches"
add constraint "inventory_batches_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES inventory_suppliers(id) ON DELETE
SET DEFAULT not valid;
alter table "public"."inventory_batches" validate constraint "inventory_batches_supplier_id_fkey";
alter table "public"."inventory_batches"
add constraint "inventory_batches_warehouse_id_fkey" FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE CASCADE not valid;
alter table "public"."inventory_batches" validate constraint "inventory_batches_warehouse_id_fkey";
alter table "public"."inventory_suppliers"
add constraint "inventory_suppliers_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE not valid;
alter table "public"."inventory_suppliers" validate constraint "inventory_suppliers_ws_id_fkey";
alter table "public"."inventory_units"
add constraint "inventory_units_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE not valid;
alter table "public"."inventory_units" validate constraint "inventory_units_ws_id_fkey";
alter table "public"."inventory_warehouses"
add constraint "inventory_warehouses_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE not valid;
alter table "public"."inventory_warehouses" validate constraint "inventory_warehouses_ws_id_fkey";
alter table "public"."vital_group_vitals"
add constraint "vital_group_vitals_group_id_fkey" FOREIGN KEY (group_id) REFERENCES healthcare_vital_groups(id) ON DELETE CASCADE not valid;
alter table "public"."vital_group_vitals" validate constraint "vital_group_vitals_group_id_fkey";
alter table "public"."vital_group_vitals"
add constraint "vital_group_vitals_vital_id_fkey" FOREIGN KEY (vital_id) REFERENCES healthcare_vitals(id) ON DELETE CASCADE not valid;
alter table "public"."vital_group_vitals" validate constraint "vital_group_vitals_vital_id_fkey";
alter table "public"."workspace_users"
add constraint "workspace_users_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE not valid;
alter table "public"."workspace_users" validate constraint "workspace_users_ws_id_fkey";
create policy "Enable delete for workspace owners" on "public"."workspaces" as permissive for delete to authenticated using (
  (
    (
      id <> '00000000-0000-0000-0000-000000000000'::uuid
    )
    AND (get_user_role(auth.uid(), id) = 'OWNER'::text)
  )
);
drop policy "Enable all access for organization members" on "public"."finance_invoice_products";
alter table "public"."finance_invoice_products" drop constraint if exists "healthcare_prescription_products_prescription_id_fkey";
alter table "public"."finance_invoice_products" drop constraint if exists "healthcare_prescription_products_product_id_fkey";
alter table "public"."finance_invoice_products" drop constraint if exists "healthcare_prescription_products_unit_id_fkey";
alter table "public"."finance_invoices" drop constraint if exists "healthcare_prescriptions_creator_id_fkey";
alter table "public"."finance_invoice_products" drop constraint if exists "finance_invoice_products_warehouse_id_fkey";
alter table "public"."inventory_products" drop constraint if exists "inventory_products_amount_check";
alter table "public"."finance_invoice_products" drop constraint if exists "finance_invoice_products_pkey";
drop index if exists "public"."finance_invoice_products_pkey";
create table "public"."finance_invoice_promotions" (
  "code" text not null default ''::text,
  "promo_id" uuid,
  "name" text default ''::text,
  "description" text default ''::text,
  "value" integer not null,
  "use_ratio" boolean not null,
  "created_at" timestamp with time zone not null default now(),
  "invoice_id" uuid
);
alter table "public"."finance_invoice_promotions" enable row level security;
alter table "public"."finance_invoice_products"
add column "product_name" text not null default ''::text;
alter table "public"."finance_invoice_products"
add column "product_unit" text not null default ''::text;
alter table "public"."finance_invoice_products"
alter column "product_id" drop not null;
alter table "public"."finance_invoice_products"
alter column "unit_id" drop not null;
alter table "public"."finance_invoice_products"
alter column "warehouse_id" drop not null;
alter table "public"."finance_invoices"
alter column "creator_id" drop not null;
alter table "public"."inventory_products"
alter column "amount" drop not null;
alter table "public"."finance_invoice_products"
add constraint "finance_invoice_products_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES finance_invoices(id) not valid;
alter table "public"."finance_invoice_products" validate constraint "finance_invoice_products_invoice_id_fkey";
alter table "public"."finance_invoice_products"
add constraint "finance_invoice_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES workspace_products(id) not valid;
alter table "public"."finance_invoice_products" validate constraint "finance_invoice_products_product_id_fkey";
alter table "public"."finance_invoice_products"
add constraint "finance_invoice_products_unit_id_fkey" FOREIGN KEY (unit_id) REFERENCES inventory_units(id) not valid;
alter table "public"."finance_invoice_products" validate constraint "finance_invoice_products_unit_id_fkey";
alter table "public"."finance_invoice_promotions"
add constraint "finance_invoice_promotions_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES finance_invoices(id) ON DELETE CASCADE not valid;
alter table "public"."finance_invoice_promotions" validate constraint "finance_invoice_promotions_invoice_id_fkey";
alter table "public"."finance_invoice_promotions"
add constraint "finance_invoice_promotions_promo_id_fkey" FOREIGN KEY (promo_id) REFERENCES workspace_promotions(id) ON DELETE
SET DEFAULT not valid;
alter table "public"."finance_invoice_promotions" validate constraint "finance_invoice_promotions_promo_id_fkey";
alter table "public"."finance_invoices"
add constraint "finance_invoices_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) not valid;
alter table "public"."finance_invoices" validate constraint "finance_invoices_creator_id_fkey";
alter table "public"."finance_invoice_products"
add constraint "finance_invoice_products_warehouse_id_fkey" FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE RESTRICT not valid;
alter table "public"."finance_invoice_products" validate constraint "finance_invoice_products_warehouse_id_fkey";
alter table "public"."inventory_products"
add constraint "inventory_products_amount_check" CHECK (
    (
      (amount IS NULL)
      OR (amount >= 0)
    )
  ) not valid;
alter table "public"."inventory_products" validate constraint "inventory_products_amount_check";
create policy "Enable all access for workspace members" on "public"."finance_invoice_products" as permissive for all to authenticated using (
  (
    (
      EXISTS (
        SELECT 1
        FROM finance_invoices fi
        WHERE (fi.id = finance_invoice_products.invoice_id)
      )
    )
    AND (
      (unit_id IS NULL)
      OR (
        EXISTS (
          SELECT 1
          FROM inventory_units iu
          WHERE (iu.id = finance_invoice_products.unit_id)
        )
      )
    )
    AND (
      (product_id IS NULL)
      OR (
        EXISTS (
          SELECT 1
          FROM workspace_products wp
          WHERE (wp.id = finance_invoice_products.product_id)
        )
      )
    )
  )
) with check (
  (
    (
      EXISTS (
        SELECT 1
        FROM finance_invoices fi
        WHERE (fi.id = finance_invoice_products.invoice_id)
      )
    )
    AND (
      (unit_id IS NULL)
      OR (
        EXISTS (
          SELECT 1
          FROM inventory_units iu
          WHERE (iu.id = finance_invoice_products.unit_id)
        )
      )
    )
    AND (
      (product_id IS NULL)
      OR (
        EXISTS (
          SELECT 1
          FROM workspace_products wp
          WHERE (wp.id = finance_invoice_products.product_id)
        )
      )
    )
  )
);
create policy "Enable all access for workspace members" on "public"."finance_invoice_promotions" as permissive for all to authenticated using (
  (
    (
      EXISTS (
        SELECT 1
        FROM finance_invoices fi
        WHERE (fi.id = finance_invoice_promotions.invoice_id)
      )
    )
    AND (
      (promo_id IS NULL)
      OR (
        EXISTS (
          SELECT 1
          FROM workspace_promotions wp
          WHERE (wp.id = finance_invoice_promotions.promo_id)
        )
      )
    )
  )
) with check (
  (
    (
      EXISTS (
        SELECT 1
        FROM finance_invoices fi
        WHERE (fi.id = finance_invoice_promotions.invoice_id)
      )
    )
    AND (
      (promo_id IS NULL)
      OR (
        EXISTS (
          SELECT 1
          FROM workspace_promotions wp
          WHERE (wp.id = finance_invoice_promotions.promo_id)
        )
      )
    )
  )
);