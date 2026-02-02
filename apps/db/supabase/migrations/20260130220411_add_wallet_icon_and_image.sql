-- Add icon column using existing platform_icon enum
ALTER TABLE public.workspace_wallets
ADD COLUMN icon public.platform_icon NULL;

-- Add image_src column for bank/mobile payment images (stores identifier like "bank/bidv")
ALTER TABLE public.workspace_wallets
ADD COLUMN image_src TEXT NULL;

-- Enforce mutual exclusivity: icon OR image, not both
ALTER TABLE public.workspace_wallets
ADD CONSTRAINT chk_wallet_icon_or_image
CHECK ((icon IS NULL) OR (image_src IS NULL));
