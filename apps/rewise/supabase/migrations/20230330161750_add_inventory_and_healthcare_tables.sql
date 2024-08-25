create table "public"."transaction_categories" (
    "id" uuid not null default uuid_generate_v4(),
    "name" text not null,
    "is_expense" boolean default true,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone default now()
);
alter table "public"."transaction_categories" enable row level security;
CREATE UNIQUE INDEX transaction_categories_pkey ON public.transaction_categories USING btree (id);
alter table "public"."transaction_categories"
add constraint "transaction_categories_pkey" PRIMARY KEY using index "transaction_categories_pkey";
alter table "public"."transaction_categories"
add constraint "transaction_categories_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) not valid;
alter table "public"."transaction_categories" validate constraint "transaction_categories_ws_id_fkey";
CREATE OR REPLACE FUNCTION get_inventory_products(
        IN _category_ids UUID [] DEFAULT NULL,
        IN _ws_id UUID DEFAULT NULL,
        IN _has_unit BOOLEAN DEFAULT NULL
    ) RETURNS TABLE (
        id UUID,
        name TEXT,
        manufacturer TEXT,
        unit TEXT,
        unit_id UUID,
        category TEXT,
        price BIGINT,
        amount BIGINT,
        ws_id UUID,
        created_at TIMESTAMPTZ
    ) AS $$ BEGIN RETURN QUERY
SELECT p.id,
    p.name,
    p.manufacturer,
    iu.name AS unit,
    ip.unit_id,
    pc.name AS category,
    ip.price,
    COALESCE(ip.amount, 0) AS amount,
    p.ws_id,
    ip.created_at
FROM workspace_products p
    LEFT JOIN inventory_products ip ON ip.product_id = p.id
    LEFT JOIN inventory_units iu ON ip.unit_id = iu.id
    LEFT JOIN product_categories pc ON p.category_id = pc.id
WHERE (
        _category_ids IS NULL
        OR p.category_id = ANY(_category_ids)
    )
    AND (
        _ws_id IS NULL
        OR p.ws_id = _ws_id
    )
    AND (
        _has_unit IS NULL
        OR (
            _has_unit = TRUE
            AND ip.unit_id IS NOT NULL
        )
    );
END;
$$ LANGUAGE plpgsql;
create table "public"."product_categories" (
    "id" uuid not null default uuid_generate_v4(),
    "name" text,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone default now()
);
alter table "public"."product_categories" enable row level security;
create table "public"."workspace_products" (
    "id" uuid not null default uuid_generate_v4(),
    "category_id" uuid not null,
    "name" text,
    "manufacturer" text,
    "usage" text,
    "description" text,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone default now()
);
alter table "public"."workspace_products" enable row level security;
CREATE UNIQUE INDEX product_categories_pkey ON public.product_categories USING btree (id);
CREATE UNIQUE INDEX workspace_products_pkey ON public.workspace_products USING btree (id);
alter table "public"."product_categories"
add constraint "product_categories_pkey" PRIMARY KEY using index "product_categories_pkey";
alter table "public"."workspace_products"
add constraint "workspace_products_pkey" PRIMARY KEY using index "workspace_products_pkey";
alter table "public"."product_categories"
add constraint "product_categories_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) not valid;
alter table "public"."product_categories" validate constraint "product_categories_ws_id_fkey";
alter table "public"."workspace_products"
add constraint "workspace_products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES product_categories(id) not valid;
alter table "public"."workspace_products" validate constraint "workspace_products_category_id_fkey";
alter table "public"."workspace_products"
add constraint "workspace_products_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) not valid;
alter table "public"."workspace_products" validate constraint "workspace_products_ws_id_fkey";
create policy "Enable all access for organization members" on "public"."transaction_categories" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));
create table "public"."inventory_products" (
    "product_id" uuid not null,
    "unit_id" uuid not null,
    "amount" bigint not null default '0'::bigint,
    "price" bigint not null default '0'::bigint,
    "created_at" timestamp with time zone default now()
);
alter table "public"."inventory_products" enable row level security;
create table "public"."inventory_suppliers" (
    "id" uuid not null default uuid_generate_v4(),
    "name" text,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone default now()
);
alter table "public"."inventory_suppliers" enable row level security;
create table "public"."inventory_units" (
    "id" uuid not null default uuid_generate_v4(),
    "name" text,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone default now()
);
alter table "public"."inventory_units" enable row level security;
create table "public"."inventory_warehouses" (
    "id" uuid not null default uuid_generate_v4(),
    "name" text,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone default now()
);
alter table "public"."inventory_warehouses" enable row level security;
CREATE UNIQUE INDEX inventory_products_pkey ON public.inventory_products USING btree (product_id, unit_id);
CREATE UNIQUE INDEX inventory_suppliers_pkey ON public.inventory_suppliers USING btree (id);
CREATE UNIQUE INDEX inventory_units_pkey ON public.inventory_units USING btree (id);
CREATE UNIQUE INDEX inventory_warehouses_pkey ON public.inventory_warehouses USING btree (id);
alter table "public"."inventory_products"
add constraint "inventory_products_pkey" PRIMARY KEY using index "inventory_products_pkey";
alter table "public"."inventory_suppliers"
add constraint "inventory_suppliers_pkey" PRIMARY KEY using index "inventory_suppliers_pkey";
alter table "public"."inventory_units"
add constraint "inventory_units_pkey" PRIMARY KEY using index "inventory_units_pkey";
alter table "public"."inventory_warehouses"
add constraint "inventory_warehouses_pkey" PRIMARY KEY using index "inventory_warehouses_pkey";
alter table "public"."inventory_products"
add constraint "inventory_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES workspace_products(id) not valid;
alter table "public"."inventory_products" validate constraint "inventory_products_product_id_fkey";
alter table "public"."inventory_products"
add constraint "inventory_products_unit_id_fkey" FOREIGN KEY (unit_id) REFERENCES inventory_units(id) not valid;
alter table "public"."inventory_products" validate constraint "inventory_products_unit_id_fkey";
alter table "public"."inventory_suppliers"
add constraint "inventory_suppliers_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) not valid;
alter table "public"."inventory_suppliers" validate constraint "inventory_suppliers_ws_id_fkey";
alter table "public"."inventory_units"
add constraint "inventory_units_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) not valid;
alter table "public"."inventory_units" validate constraint "inventory_units_ws_id_fkey";
alter table "public"."inventory_warehouses"
add constraint "inventory_warehouses_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) not valid;
alter table "public"."inventory_warehouses" validate constraint "inventory_warehouses_ws_id_fkey";
create policy "Enable all access for organization members" on "public"."inventory_products" as permissive for all to authenticated using (
    (
        (
            EXISTS (
                SELECT 1
                FROM workspace_products p
                WHERE (p.id = inventory_products.product_id)
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM inventory_units u
                WHERE (u.id = inventory_products.unit_id)
            )
        )
    )
) with check (
    (
        (
            EXISTS (
                SELECT 1
                FROM workspace_products p
                WHERE (p.id = inventory_products.product_id)
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM inventory_units u
                WHERE (u.id = inventory_products.unit_id)
            )
        )
    )
);
create policy "Enable all access for organization members" on "public"."inventory_suppliers" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));
create policy "Enable all access for organization members" on "public"."inventory_units" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));
create policy "Enable all access for organization members" on "public"."inventory_warehouses" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));
create policy "Enable all access for organization members" on "public"."product_categories" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));
create policy "Enable all access for organization members" on "public"."workspace_products" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));
create table "public"."inventory_batches" (
    "id" uuid not null default uuid_generate_v4(),
    "price" bigint not null default '0'::bigint,
    "warehouse_id" uuid not null,
    "supplier_id" uuid,
    "created_at" timestamp with time zone default now()
);
alter table "public"."inventory_batches" enable row level security;
create table "public"."workspace_users" (
    "id" uuid not null default uuid_generate_v4(),
    "name" text,
    "email" text,
    "phone" text,
    "birthday" date,
    "gender" text,
    "ethnicity" text,
    "guardian" text,
    "address" text,
    "national_id" text,
    "note" text,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone default now()
);
alter table "public"."workspace_users" enable row level security;
CREATE UNIQUE INDEX inventory_batches_pkey ON public.inventory_batches USING btree (id);
CREATE UNIQUE INDEX workspace_users_pkey ON public.workspace_users USING btree (id);
alter table "public"."inventory_batches"
add constraint "inventory_batches_pkey" PRIMARY KEY using index "inventory_batches_pkey";
alter table "public"."workspace_users"
add constraint "workspace_users_pkey" PRIMARY KEY using index "workspace_users_pkey";
alter table "public"."inventory_batches"
add constraint "inventory_batches_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES inventory_suppliers(id) not valid;
alter table "public"."inventory_batches" validate constraint "inventory_batches_supplier_id_fkey";
alter table "public"."inventory_batches"
add constraint "inventory_batches_warehouse_id_fkey" FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) not valid;
alter table "public"."inventory_batches" validate constraint "inventory_batches_warehouse_id_fkey";
alter table "public"."workspace_users"
add constraint "workspace_users_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) not valid;
alter table "public"."workspace_users" validate constraint "workspace_users_ws_id_fkey";
create policy "Enable all access for organization members" on "public"."inventory_batches" as permissive for all to authenticated using (
    (
        (
            EXISTS (
                SELECT 1
                FROM inventory_warehouses w
                WHERE (w.id = inventory_batches.warehouse_id)
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM inventory_suppliers s
                WHERE (s.id = inventory_batches.supplier_id)
            )
        )
    )
) with check (
    (
        (
            EXISTS (
                SELECT 1
                FROM inventory_warehouses w
                WHERE (w.id = inventory_batches.warehouse_id)
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM inventory_suppliers s
                WHERE (s.id = inventory_batches.supplier_id)
            )
        )
    )
);
create policy "Enable all access for workspace members" on "public"."workspace_users" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));
drop policy "Enable delete for users who can access the task" on "public"."task_assignees";
drop policy "Enable update for users based on their uid" on "public"."users";
drop policy "Enable all access for organization members" on "public"."workspace_boards";
create table "public"."healthcare_checkup_vital_groups" (
    "checkup_id" uuid not null,
    "group_id" uuid not null,
    "created_at" timestamp with time zone default now()
);
alter table "public"."healthcare_checkup_vital_groups" enable row level security;
create table "public"."healthcare_checkup_vitals" (
    "checkup_id" uuid not null,
    "vital_id" uuid not null,
    "value" real,
    "created_at" timestamp with time zone default now()
);
alter table "public"."healthcare_checkup_vitals" enable row level security;
create table "public"."healthcare_checkups" (
    "id" uuid not null default uuid_generate_v4(),
    "patient_id" uuid not null,
    "diagnosis_id" uuid,
    "checked" boolean not null default false,
    "checkup_at" timestamp with time zone not null default now(),
    "next_checked" boolean,
    "next_checkup_at" timestamp with time zone,
    "note" text,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone default now(),
    "completed_at" timestamp with time zone,
    "creator_id" uuid not null
);
alter table "public"."healthcare_checkups" enable row level security;
create table "public"."healthcare_diagnoses" (
    "id" uuid not null default uuid_generate_v4(),
    "name" text,
    "description" text,
    "note" text,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone default now()
);
alter table "public"."healthcare_diagnoses" enable row level security;
create table "public"."healthcare_prescription_products" (
    "prescription_id" uuid not null,
    "product_id" uuid not null,
    "unit_id" uuid not null,
    "amount" bigint not null,
    "price" bigint not null,
    "created_at" timestamp with time zone default now()
);
alter table "public"."healthcare_prescription_products" enable row level security;
create table "public"."healthcare_prescriptions" (
    "id" uuid not null default uuid_generate_v4(),
    "price" bigint not null,
    "price_diff" bigint not null default '0'::bigint,
    "note" text,
    "advice" text,
    "patient_id" uuid,
    "ws_id" uuid not null,
    "creator_id" uuid not null,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone default now()
);
alter table "public"."healthcare_prescriptions" enable row level security;
create table "public"."healthcare_vital_groups" (
    "id" uuid not null default uuid_generate_v4(),
    "name" text not null,
    "description" text,
    "note" text,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone default now()
);
alter table "public"."healthcare_vital_groups" enable row level security;
create table "public"."healthcare_vitals" (
    "id" uuid not null default uuid_generate_v4(),
    "name" text not null,
    "unit" text,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone default now()
);
alter table "public"."healthcare_vitals" enable row level security;
create table "public"."inventory_batch_products" (
    "batch_id" uuid not null,
    "product_id" uuid not null,
    "unit_id" uuid not null,
    "amount" bigint not null default '0'::bigint,
    "price" bigint not null default '0'::bigint,
    "created_at" timestamp with time zone default now()
);
alter table "public"."inventory_batch_products" enable row level security;
create table "public"."vital_group_vitals" (
    "group_id" uuid not null,
    "vital_id" uuid not null,
    "created_at" timestamp with time zone default now()
);
alter table "public"."vital_group_vitals" enable row level security;
CREATE UNIQUE INDEX healthcare_checkup_vital_groups_pkey ON public.healthcare_checkup_vital_groups USING btree (checkup_id, group_id);
CREATE UNIQUE INDEX healthcare_checkup_vitals_pkey ON public.healthcare_checkup_vitals USING btree (checkup_id, vital_id);
CREATE UNIQUE INDEX healthcare_checkups_pkey ON public.healthcare_checkups USING btree (id);
CREATE UNIQUE INDEX healthcare_diagnoses_pkey ON public.healthcare_diagnoses USING btree (id);
CREATE UNIQUE INDEX healthcare_prescription_products_pkey ON public.healthcare_prescription_products USING btree (prescription_id, product_id, unit_id);
CREATE UNIQUE INDEX healthcare_prescriptions_pkey ON public.healthcare_prescriptions USING btree (id);
CREATE UNIQUE INDEX healthcare_vital_groups_pkey ON public.healthcare_vital_groups USING btree (id);
CREATE UNIQUE INDEX healthcare_vitals_pkey ON public.healthcare_vitals USING btree (id);
CREATE UNIQUE INDEX inventory_batch_products_pkey ON public.inventory_batch_products USING btree (batch_id, product_id, unit_id);
CREATE UNIQUE INDEX vital_group_vitals_pkey ON public.vital_group_vitals USING btree (group_id, vital_id);
alter table "public"."healthcare_checkup_vital_groups"
add constraint "healthcare_checkup_vital_groups_pkey" PRIMARY KEY using index "healthcare_checkup_vital_groups_pkey";
alter table "public"."healthcare_checkup_vitals"
add constraint "healthcare_checkup_vitals_pkey" PRIMARY KEY using index "healthcare_checkup_vitals_pkey";
alter table "public"."healthcare_checkups"
add constraint "healthcare_checkups_pkey" PRIMARY KEY using index "healthcare_checkups_pkey";
alter table "public"."healthcare_diagnoses"
add constraint "healthcare_diagnoses_pkey" PRIMARY KEY using index "healthcare_diagnoses_pkey";
alter table "public"."healthcare_prescription_products"
add constraint "healthcare_prescription_products_pkey" PRIMARY KEY using index "healthcare_prescription_products_pkey";
alter table "public"."healthcare_prescriptions"
add constraint "healthcare_prescriptions_pkey" PRIMARY KEY using index "healthcare_prescriptions_pkey";
alter table "public"."healthcare_vital_groups"
add constraint "healthcare_vital_groups_pkey" PRIMARY KEY using index "healthcare_vital_groups_pkey";
alter table "public"."healthcare_vitals"
add constraint "healthcare_vitals_pkey" PRIMARY KEY using index "healthcare_vitals_pkey";
alter table "public"."inventory_batch_products"
add constraint "inventory_batch_products_pkey" PRIMARY KEY using index "inventory_batch_products_pkey";
alter table "public"."vital_group_vitals"
add constraint "vital_group_vitals_pkey" PRIMARY KEY using index "vital_group_vitals_pkey";
alter table "public"."healthcare_checkup_vital_groups"
add constraint "healthcare_checkup_vital_groups_checkup_id_fkey" FOREIGN KEY (checkup_id) REFERENCES healthcare_checkups(id) not valid;
alter table "public"."healthcare_checkup_vital_groups" validate constraint "healthcare_checkup_vital_groups_checkup_id_fkey";
alter table "public"."healthcare_checkup_vital_groups"
add constraint "healthcare_checkup_vital_groups_group_id_fkey" FOREIGN KEY (group_id) REFERENCES healthcare_vital_groups(id) not valid;
alter table "public"."healthcare_checkup_vital_groups" validate constraint "healthcare_checkup_vital_groups_group_id_fkey";
alter table "public"."healthcare_checkup_vitals"
add constraint "healthcare_checkup_vitals_checkup_id_fkey" FOREIGN KEY (checkup_id) REFERENCES healthcare_checkups(id) not valid;
alter table "public"."healthcare_checkup_vitals" validate constraint "healthcare_checkup_vitals_checkup_id_fkey";
alter table "public"."healthcare_checkup_vitals"
add constraint "healthcare_checkup_vitals_vital_id_fkey" FOREIGN KEY (vital_id) REFERENCES healthcare_vitals(id) not valid;
alter table "public"."healthcare_checkup_vitals" validate constraint "healthcare_checkup_vitals_vital_id_fkey";
alter table "public"."healthcare_checkups"
add constraint "healthcare_checkups_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) not valid;
alter table "public"."healthcare_checkups" validate constraint "healthcare_checkups_creator_id_fkey";
alter table "public"."healthcare_checkups"
add constraint "healthcare_checkups_diagnosis_id_fkey" FOREIGN KEY (diagnosis_id) REFERENCES healthcare_diagnoses(id) not valid;
alter table "public"."healthcare_checkups" validate constraint "healthcare_checkups_diagnosis_id_fkey";
alter table "public"."healthcare_checkups"
add constraint "healthcare_checkups_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES workspace_users(id) not valid;
alter table "public"."healthcare_checkups" validate constraint "healthcare_checkups_patient_id_fkey";
alter table "public"."healthcare_checkups"
add constraint "healthcare_checkups_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) not valid;
alter table "public"."healthcare_checkups" validate constraint "healthcare_checkups_ws_id_fkey";
alter table "public"."healthcare_diagnoses"
add constraint "healthcare_diagnoses_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) not valid;
alter table "public"."healthcare_diagnoses" validate constraint "healthcare_diagnoses_ws_id_fkey";
alter table "public"."healthcare_prescription_products"
add constraint "healthcare_prescription_products_prescription_id_fkey" FOREIGN KEY (prescription_id) REFERENCES healthcare_prescriptions(id) not valid;
alter table "public"."healthcare_prescription_products" validate constraint "healthcare_prescription_products_prescription_id_fkey";
alter table "public"."healthcare_prescription_products"
add constraint "healthcare_prescription_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES workspace_products(id) not valid;
alter table "public"."healthcare_prescription_products" validate constraint "healthcare_prescription_products_product_id_fkey";
alter table "public"."healthcare_prescription_products"
add constraint "healthcare_prescription_products_unit_id_fkey" FOREIGN KEY (unit_id) REFERENCES inventory_units(id) not valid;
alter table "public"."healthcare_prescription_products" validate constraint "healthcare_prescription_products_unit_id_fkey";
alter table "public"."healthcare_prescriptions"
add constraint "healthcare_prescriptions_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) not valid;
alter table "public"."healthcare_prescriptions" validate constraint "healthcare_prescriptions_creator_id_fkey";
alter table "public"."healthcare_prescriptions"
add constraint "healthcare_prescriptions_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES workspace_users(id) not valid;
alter table "public"."healthcare_prescriptions" validate constraint "healthcare_prescriptions_patient_id_fkey";
alter table "public"."healthcare_prescriptions"
add constraint "healthcare_prescriptions_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) not valid;
alter table "public"."healthcare_prescriptions" validate constraint "healthcare_prescriptions_ws_id_fkey";
alter table "public"."healthcare_vital_groups"
add constraint "healthcare_vital_groups_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) not valid;
alter table "public"."healthcare_vital_groups" validate constraint "healthcare_vital_groups_ws_id_fkey";
alter table "public"."healthcare_vitals"
add constraint "healthcare_vitals_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) not valid;
alter table "public"."healthcare_vitals" validate constraint "healthcare_vitals_ws_id_fkey";
alter table "public"."inventory_batch_products"
add constraint "inventory_batch_products_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) not valid;
alter table "public"."inventory_batch_products" validate constraint "inventory_batch_products_batch_id_fkey";
alter table "public"."inventory_batch_products"
add constraint "inventory_batch_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES workspace_products(id) not valid;
alter table "public"."inventory_batch_products" validate constraint "inventory_batch_products_product_id_fkey";
alter table "public"."inventory_batch_products"
add constraint "inventory_batch_products_unit_id_fkey" FOREIGN KEY (unit_id) REFERENCES inventory_units(id) not valid;
alter table "public"."inventory_batch_products" validate constraint "inventory_batch_products_unit_id_fkey";
alter table "public"."vital_group_vitals"
add constraint "vital_group_vitals_group_id_fkey" FOREIGN KEY (group_id) REFERENCES healthcare_vital_groups(id) not valid;
alter table "public"."vital_group_vitals" validate constraint "vital_group_vitals_group_id_fkey";
alter table "public"."vital_group_vitals"
add constraint "vital_group_vitals_vital_id_fkey" FOREIGN KEY (vital_id) REFERENCES healthcare_vitals(id) not valid;
alter table "public"."vital_group_vitals" validate constraint "vital_group_vitals_vital_id_fkey";
create policy "Enable all access for organization members" on "public"."healthcare_checkup_vital_groups" as permissive for all to authenticated using (
    (
        (
            EXISTS (
                SELECT 1
                FROM healthcare_checkups c
                WHERE (
                        c.id = healthcare_checkup_vital_groups.checkup_id
                    )
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM healthcare_vital_groups v
                WHERE (v.id = healthcare_checkup_vital_groups.group_id)
            )
        )
    )
) with check (
    (
        (
            EXISTS (
                SELECT 1
                FROM healthcare_checkups c
                WHERE (
                        c.id = healthcare_checkup_vital_groups.checkup_id
                    )
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM healthcare_vital_groups v
                WHERE (v.id = healthcare_checkup_vital_groups.group_id)
            )
        )
    )
);
create policy "Enable all access for organization members" on "public"."healthcare_checkup_vitals" as permissive for all to authenticated using (
    (
        (
            EXISTS (
                SELECT 1
                FROM healthcare_checkups c
                WHERE (c.id = healthcare_checkup_vitals.checkup_id)
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM healthcare_vitals v
                WHERE (v.id = healthcare_checkup_vitals.vital_id)
            )
        )
    )
) with check (
    (
        (
            EXISTS (
                SELECT 1
                FROM healthcare_checkups c
                WHERE (c.id = healthcare_checkup_vitals.checkup_id)
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM healthcare_vitals v
                WHERE (v.id = healthcare_checkup_vitals.vital_id)
            )
        )
    )
);
create policy "Enable all access for organization members" on "public"."healthcare_checkups" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));
create policy "Enable all access for organization members" on "public"."healthcare_diagnoses" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));
create policy "Enable all access for organization members" on "public"."healthcare_prescription_products" as permissive for all to authenticated using (
    (
        (
            EXISTS (
                SELECT 1
                FROM healthcare_prescriptions hp
                WHERE (
                        hp.id = healthcare_prescription_products.prescription_id
                    )
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM inventory_units iu
                WHERE (iu.id = healthcare_prescription_products.unit_id)
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM workspace_products wp
                WHERE (
                        wp.id = healthcare_prescription_products.product_id
                    )
            )
        )
    )
) with check (
    (
        (
            EXISTS (
                SELECT 1
                FROM healthcare_prescriptions hp
                WHERE (
                        hp.id = healthcare_prescription_products.prescription_id
                    )
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM inventory_units iu
                WHERE (iu.id = healthcare_prescription_products.unit_id)
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM workspace_products wp
                WHERE (
                        wp.id = healthcare_prescription_products.product_id
                    )
            )
        )
    )
);
create policy "Enable all access for organization members" on "public"."healthcare_prescriptions" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));
create policy "Enable all access for organization members" on "public"."healthcare_vital_groups" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));
create policy "Enable all access for organization members" on "public"."healthcare_vitals" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));
create policy "Enable all access for organization members" on "public"."inventory_batch_products" as permissive for all to authenticated using (
    (
        (
            EXISTS (
                SELECT 1
                FROM inventory_batches b
                WHERE (b.id = inventory_batch_products.batch_id)
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM workspace_products p
                WHERE (p.id = inventory_batch_products.product_id)
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM inventory_units u
                WHERE (u.id = inventory_batch_products.unit_id)
            )
        )
    )
) with check (
    (
        (
            EXISTS (
                SELECT 1
                FROM inventory_batches b
                WHERE (b.id = inventory_batch_products.batch_id)
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM workspace_products p
                WHERE (p.id = inventory_batch_products.product_id)
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM inventory_units u
                WHERE (u.id = inventory_batch_products.unit_id)
            )
        )
    )
);
create policy "Enable all access for organization members" on "public"."vital_group_vitals" as permissive for all to authenticated using (
    (
        (
            EXISTS (
                SELECT 1
                FROM healthcare_vital_groups g
                WHERE (g.id = vital_group_vitals.group_id)
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM healthcare_vitals v
                WHERE (v.id = vital_group_vitals.vital_id)
            )
        )
    )
) with check (
    (
        (
            EXISTS (
                SELECT 1
                FROM healthcare_vital_groups g
                WHERE (g.id = vital_group_vitals.group_id)
            )
        )
        AND (
            EXISTS (
                SELECT 1
                FROM healthcare_vitals v
                WHERE (v.id = vital_group_vitals.vital_id)
            )
        )
    )
);
create policy "Enable delete for users who can access the task" on "public"."task_assignees" as permissive for delete to authenticated using (is_task_accessible(task_id));
create policy "Enable update for users based on their uid" on "public"."users" as permissive for
update to authenticated using ((auth.uid() = id)) with check ((auth.uid() = id));
create policy "Enable all access for organization members" on "public"."workspace_boards" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));
-- Function to update the product_units table's amount value when a product is added, updated, or deleted from inventory_batch_products
CREATE OR REPLACE FUNCTION update_inventory_product_amount() RETURNS TRIGGER AS $$ BEGIN IF (TG_OP = 'INSERT') THEN
UPDATE inventory_products ip
SET amount = ip.amount + NEW.amount
WHERE ip.product_id = NEW.product_id
    AND ip.unit_id = NEW.unit_id;
ELSIF (TG_OP = 'UPDATE') THEN
UPDATE inventory_products ip
SET amount = ip.amount - OLD.amount + NEW.amount
WHERE ip.product_id = NEW.product_id
    AND ip.unit_id = NEW.unit_id;
ELSIF (TG_OP = 'DELETE') THEN
UPDATE inventory_products ip
SET amount = ip.amount - OLD.amount
WHERE ip.product_id = OLD.product_id
    AND ip.unit_id = OLD.unit_id;
END IF;
RETURN NULL;
END;
$$ LANGUAGE plpgsql;
-- Create the trigger
CREATE TRIGGER update_inventory_products_amount_trigger
AFTER
INSERT
    OR
UPDATE
    OR DELETE ON inventory_batch_products FOR EACH ROW EXECUTE FUNCTION update_inventory_product_amount();