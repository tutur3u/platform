-- Create a function to calculate count of all users in a specific workspace
CREATE OR REPLACE FUNCTION public.get_workspace_users_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.workspace_users
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all roles in a specific workspace
CREATE OR REPLACE FUNCTION public.get_workspace_user_roles_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.workspace_user_roles
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- update the public.get_inventory_products_count to have prope
CREATE OR REPLACE FUNCTION public.get_inventory_products_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.inventory_products ip
    INNER JOIN public.workspace_products wp ON wp.id = ip.product_id
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Rename public.healthcare_prescriptions to public.finance_invoices
ALTER TABLE public.healthcare_prescriptions
    RENAME TO finance_invoices;
-- Rename public.healthcare_prescription_products to public.finance_invoice_products
ALTER TABLE public.healthcare_prescription_products
    RENAME TO finance_invoice_products;
-- Rename public.finance_invoices.advice to public.finance_invoices.notice
ALTER TABLE public.finance_invoices
    RENAME COLUMN advice TO notice;
-- Rename public.finance_invoices.patient_id to public.finance_invoices.customer_id
ALTER TABLE public.finance_invoices
    RENAME COLUMN patient_id TO customer_id;
-- Rename public.finance_invoice_products.prescription_id to public.finance_invoice_products.invoice_id
ALTER TABLE public.finance_invoice_products
    RENAME COLUMN prescription_id TO invoice_id;
-- Drop the public.get_healthcare_prescriptions_count function
DROP FUNCTION public.get_healthcare_prescriptions_count(ws_id uuid);
-- Create a function to calculate count of all prescriptions in a specific healthcare workspace
CREATE OR REPLACE FUNCTION public.get_finance_invoices_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.finance_invoices
WHERE ws_id = $1 $$ LANGUAGE SQL;