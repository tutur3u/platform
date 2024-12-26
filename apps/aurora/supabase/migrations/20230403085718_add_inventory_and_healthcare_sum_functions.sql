alter table "public"."workspace_users"
add column "balance" bigint default '0'::bigint;
-- Create a function to calculate count of all products in a specific workspace
CREATE OR REPLACE FUNCTION public.get_workspace_products_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.workspace_products
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all product and unit combinations in a specific workspace
CREATE OR REPLACE FUNCTION public.get_inventory_products_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.inventory_products
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all product categories in a specific inventory
CREATE OR REPLACE FUNCTION public.get_inventory_product_categories_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.product_categories
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all warehouses in a specific inventory
CREATE OR REPLACE FUNCTION public.get_inventory_warehouses_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.inventory_warehouses
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all units in a specific inventory
CREATE OR REPLACE FUNCTION public.get_inventory_units_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.inventory_units
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all suppliers in a specific inventory
CREATE OR REPLACE FUNCTION public.get_inventory_suppliers_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.inventory_suppliers
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all batches in a specific inventory, linked via warehouse_id
CREATE OR REPLACE FUNCTION public.get_inventory_batches_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.inventory_batches wb
    INNER JOIN public.inventory_warehouses ww ON wb.warehouse_id = ww.id
WHERE ww.ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all prescriptions in a specific healthcare workspace
CREATE OR REPLACE FUNCTION public.get_healthcare_prescriptions_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.healthcare_prescriptions
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all checkups in a specific healthcare workspace
CREATE OR REPLACE FUNCTION public.get_healthcare_checkups_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.healthcare_checkups
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all diagnoses in a specific healthcare workspace
CREATE OR REPLACE FUNCTION public.get_healthcare_diagnoses_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.healthcare_diagnoses
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all vitals in a specific healthcare workspace
CREATE OR REPLACE FUNCTION public.get_healthcare_vitals_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.healthcare_vitals
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all vital groups in a specific healthcare workspace
CREATE OR REPLACE FUNCTION public.get_healthcare_vital_groups_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.healthcare_vital_groups
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Make sure public.workspace_members.ws_id on delete cascade
ALTER TABLE public.workspace_members DROP CONSTRAINT IF EXISTS workspace_members_ws_id_fkey;
ALTER TABLE public.workspace_members
ADD CONSTRAINT workspace_members_ws_id_fkey FOREIGN KEY (ws_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
-- Make sure public.workspace_wallets.ws_id on delete cascade
ALTER TABLE public.workspace_wallets DROP CONSTRAINT IF EXISTS workspace_wallets_ws_id_fkey;
ALTER TABLE public.workspace_wallets
ADD CONSTRAINT workspace_wallets_ws_id_fkey FOREIGN KEY (ws_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
-- Make sure public.workspace_documents.ws_id on delete cascade
ALTER TABLE public.workspace_documents DROP CONSTRAINT IF EXISTS workspace_documents_ws_id_fkey;
ALTER TABLE public.workspace_documents
ADD CONSTRAINT workspace_documents_ws_id_fkey FOREIGN KEY (ws_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
-- Make sure public.workspace_teams.ws_id on delete cascade
ALTER TABLE public.workspace_teams DROP CONSTRAINT IF EXISTS workspace_teams_ws_id_fkey;
ALTER TABLE public.workspace_teams DROP CONSTRAINT IF EXISTS projects_ws_id_fkey;
ALTER TABLE public.workspace_teams
ADD CONSTRAINT workspace_teams_ws_id_fkey FOREIGN KEY (ws_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
-- Make sure public.workspace_boards.ws_id on delete cascade
ALTER TABLE public.workspace_boards DROP CONSTRAINT IF EXISTS workspace_boards_ws_id_fkey;
ALTER TABLE public.workspace_boards
ADD CONSTRAINT workspace_boards_ws_id_fkey FOREIGN KEY (ws_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
-- Make sure public.transaction_categories.ws_id on delete cascade
ALTER TABLE public.transaction_categories DROP CONSTRAINT IF EXISTS transaction_categories_ws_id_fkey;
ALTER TABLE public.transaction_categories
ADD CONSTRAINT transaction_categories_ws_id_fkey FOREIGN KEY (ws_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
-- Make sure public.product_categories.ws_id on delete cascade
ALTER TABLE public.product_categories DROP CONSTRAINT IF EXISTS product_categories_ws_id_fkey;
ALTER TABLE public.product_categories
ADD CONSTRAINT product_categories_ws_id_fkey FOREIGN KEY (ws_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
-- Make sure public.workspace_products.ws_id on delete cascade
ALTER TABLE public.workspace_products DROP CONSTRAINT IF EXISTS workspace_products_ws_id_fkey;
ALTER TABLE public.workspace_products
ADD CONSTRAINT workspace_products_ws_id_fkey FOREIGN KEY (ws_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;