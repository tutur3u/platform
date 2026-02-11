-- Add support for Momo/ZaloPay high-interest savings programs
-- Interest tracking is OPT-IN ONLY - users must explicitly enable it

-- Enums for interest providers and tiers
CREATE TYPE public.wallet_interest_provider AS ENUM ('momo', 'zalopay');
CREATE TYPE public.zalopay_tier AS ENUM ('standard', 'gold', 'diamond');

-- Interest configuration per wallet (opt-in feature)
CREATE TABLE public.wallet_interest_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.workspace_wallets(id) ON DELETE CASCADE,
  provider wallet_interest_provider NOT NULL,
  zalopay_tier zalopay_tier DEFAULT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_calculated_at TIMESTAMPTZ,
  last_interest_amount BIGINT DEFAULT 0,
  total_interest_earned BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_wallet_interest_config UNIQUE (wallet_id),
  CONSTRAINT chk_zalopay_tier CHECK (
    (provider = 'momo' AND zalopay_tier IS NULL) OR
    (provider = 'zalopay')
  )
);

-- Rate history for tracking provider rate changes over time
CREATE TABLE public.wallet_interest_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES public.wallet_interest_configs(id) ON DELETE CASCADE,
  annual_rate DECIMAL(5,2) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_rate_range CHECK (annual_rate > 0 AND annual_rate <= 100),
  CONSTRAINT chk_rate_dates CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- Vietnamese holidays for business day calculation
-- Interest calculation skips weekends and holidays
CREATE TABLE public.vietnamese_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)::INT) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_wallet_interest_configs_wallet ON public.wallet_interest_configs(wallet_id);
CREATE INDEX idx_wallet_interest_configs_enabled ON public.wallet_interest_configs(enabled) WHERE enabled = true;
CREATE INDEX idx_wallet_interest_rates_config ON public.wallet_interest_rates(config_id);
CREATE INDEX idx_wallet_interest_rates_effective ON public.wallet_interest_rates(effective_from, effective_to);
CREATE INDEX idx_vietnamese_holidays_date ON public.vietnamese_holidays(date);
CREATE INDEX idx_vietnamese_holidays_year ON public.vietnamese_holidays(year);

-- Enable RLS
ALTER TABLE public.wallet_interest_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_interest_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vietnamese_holidays ENABLE ROW LEVEL SECURITY;

-- RLS Policies for wallet_interest_configs
-- Access follows wallet ownership through workspace membership
CREATE POLICY "Users can view interest configs for their workspace wallets"
  ON public.wallet_interest_configs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_wallets ww
      JOIN public.workspace_members wm ON wm.ws_id = ww.ws_id
      WHERE ww.id = wallet_interest_configs.wallet_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create interest configs for their workspace wallets"
  ON public.wallet_interest_configs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_wallets ww
      JOIN public.workspace_members wm ON wm.ws_id = ww.ws_id
      WHERE ww.id = wallet_interest_configs.wallet_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update interest configs for their workspace wallets"
  ON public.wallet_interest_configs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_wallets ww
      JOIN public.workspace_members wm ON wm.ws_id = ww.ws_id
      WHERE ww.id = wallet_interest_configs.wallet_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete interest configs for their workspace wallets"
  ON public.wallet_interest_configs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_wallets ww
      JOIN public.workspace_members wm ON wm.ws_id = ww.ws_id
      WHERE ww.id = wallet_interest_configs.wallet_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies for wallet_interest_rates
-- Access follows the config ownership
CREATE POLICY "Users can view interest rates for their configs"
  ON public.wallet_interest_rates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.wallet_interest_configs wic
      JOIN public.workspace_wallets ww ON ww.id = wic.wallet_id
      JOIN public.workspace_members wm ON wm.ws_id = ww.ws_id
      WHERE wic.id = wallet_interest_rates.config_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create interest rates for their configs"
  ON public.wallet_interest_rates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wallet_interest_configs wic
      JOIN public.workspace_wallets ww ON ww.id = wic.wallet_id
      JOIN public.workspace_members wm ON wm.ws_id = ww.ws_id
      WHERE wic.id = wallet_interest_rates.config_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update interest rates for their configs"
  ON public.wallet_interest_rates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.wallet_interest_configs wic
      JOIN public.workspace_wallets ww ON ww.id = wic.wallet_id
      JOIN public.workspace_members wm ON wm.ws_id = ww.ws_id
      WHERE wic.id = wallet_interest_rates.config_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete interest rates for their configs"
  ON public.wallet_interest_rates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.wallet_interest_configs wic
      JOIN public.workspace_wallets ww ON ww.id = wic.wallet_id
      JOIN public.workspace_members wm ON wm.ws_id = ww.ws_id
      WHERE wic.id = wallet_interest_rates.config_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies for vietnamese_holidays
-- Public read access (needed for interest calculations)
-- Admin write access (ROOT workspace members only)
CREATE POLICY "Anyone can read holidays"
  ON public.vietnamese_holidays FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert holidays"
  ON public.vietnamese_holidays FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.ws_id = '00000000-0000-0000-0000-000000000000'
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can update holidays"
  ON public.vietnamese_holidays FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.ws_id = '00000000-0000-0000-0000-000000000000'
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can delete holidays"
  ON public.vietnamese_holidays FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.ws_id = '00000000-0000-0000-0000-000000000000'
      AND wm.user_id = auth.uid()
    )
  );

-- Seed Vietnamese holidays for 2025-2026
-- These are official public holidays when banks/financial services are closed
INSERT INTO public.vietnamese_holidays (date, name) VALUES
  -- 2025 Holidays
  ('2025-01-01', 'New Year'),
  ('2025-01-27', 'Lunar New Year Eve'),
  ('2025-01-28', 'Tet Day 1'),
  ('2025-01-29', 'Tet Day 2'),
  ('2025-01-30', 'Tet Day 3'),
  ('2025-01-31', 'Tet Day 4'),
  ('2025-02-01', 'Tet Day 5'),
  ('2025-04-07', 'Hung Kings Commemoration Day'),
  ('2025-04-30', 'Reunification Day'),
  ('2025-05-01', 'International Labour Day'),
  ('2025-09-02', 'National Day'),
  -- 2026 Holidays
  ('2026-01-01', 'New Year'),
  ('2026-02-16', 'Lunar New Year Eve'),
  ('2026-02-17', 'Tet Day 1'),
  ('2026-02-18', 'Tet Day 2'),
  ('2026-02-19', 'Tet Day 3'),
  ('2026-02-20', 'Tet Day 4'),
  ('2026-02-21', 'Tet Day 5'),
  ('2026-04-26', 'Hung Kings Commemoration Day'),
  ('2026-04-30', 'Reunification Day'),
  ('2026-05-01', 'International Labour Day'),
  ('2026-09-02', 'National Day');

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_wallet_interest_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER trg_wallet_interest_config_updated_at
  BEFORE UPDATE ON public.wallet_interest_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_wallet_interest_config_updated_at();

-- Function to auto-close previous rate when adding new rate
CREATE OR REPLACE FUNCTION public.close_previous_interest_rate()
RETURNS TRIGGER AS $$
BEGIN
  -- Close any existing open rate for this config
  UPDATE public.wallet_interest_rates
  SET effective_to = NEW.effective_from - INTERVAL '1 day'
  WHERE config_id = NEW.config_id
    AND effective_to IS NULL
    AND id != NEW.id
    AND effective_from < NEW.effective_from;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-close previous rates
CREATE TRIGGER trg_close_previous_interest_rate
  AFTER INSERT ON public.wallet_interest_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.close_previous_interest_rate();
