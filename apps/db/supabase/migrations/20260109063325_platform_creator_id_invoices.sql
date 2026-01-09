-- Add platform_creator_id column to finance_invoices table
-- This column references the platform user (public.users) who created the invoice
-- This is in addition to the existing creator_id which references workspace_users (virtual users)
ALTER TABLE public.finance_invoices
ADD COLUMN platform_creator_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- Add index for efficient lookups
CREATE INDEX idx_finance_invoices_platform_creator_id ON public.finance_invoices(platform_creator_id);

-- Add comment for documentation
COMMENT ON COLUMN public.finance_invoices.platform_creator_id IS 'References the platform user who created the invoice. Used for display purposes, prioritized over legacy creator_id for name lookup.';
