alter table "public"."inventory_units" add column "type" text default 'quantity'::text;

alter table "public"."inventory_units" add constraint "inventory_units_type_check" CHECK ((type = ANY (ARRAY['quantity'::text, 'non-quantity'::text]))) not valid;

alter table "public"."inventory_units" validate constraint "inventory_units_type_check";


