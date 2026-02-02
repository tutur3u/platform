-- Add icon and color columns to transaction_categories
-- icon: stores the icon key from WorkspaceBoardIconKey enum (e.g., "UtensilsCrossed")
-- color: stores hex color string (e.g., "#ef4444")

ALTER TABLE public.transaction_categories
ADD COLUMN IF NOT EXISTS icon text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS color text DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.transaction_categories.icon IS 'Icon key from WorkspaceBoardIconKey enum (e.g., "UtensilsCrossed")';
COMMENT ON COLUMN public.transaction_categories.color IS 'Hex color string (e.g., "#ef4444")';
