import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  DEFAULT_DISPLAY_CURRENCY,
  type DisplayCurrency,
  normalizeDisplayCurrency,
} from './display-currency';

/**
 * Resolves the newest USD-based rate for a display currency.
 *
 * Falls back to USD when no rate exists rather than guessing one: showing an
 * unconverted number labelled as đồng would be worse than showing dollars.
 */
export async function resolveDisplayCurrency(
  requested: string | undefined | null
): Promise<DisplayCurrency> {
  const code = normalizeDisplayCurrency(requested);
  if (code === 'USD') return { code, rate: 1 };

  try {
    const sbAdmin = await createAdminClient({ noCookie: true });
    const { data, error } = await sbAdmin
      .from('currency_exchange_rates')
      .select('rate')
      .eq('base_currency', 'USD')
      .eq('target_currency', code)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.rate || data.rate <= 0) {
      return { code: DEFAULT_DISPLAY_CURRENCY, rate: 1 };
    }
    return { code, rate: data.rate };
  } catch {
    return { code: DEFAULT_DISPLAY_CURRENCY, rate: 1 };
  }
}
