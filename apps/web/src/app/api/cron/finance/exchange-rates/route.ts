import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { SUPPORTED_CURRENCIES } from '@tuturuuu/utils/currencies';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const maxDuration = 300;

const PRIMARY_API_URL =
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json';
const FALLBACK_API_URL =
  'https://latest.currency-api.pages.dev/v1/currencies/usd.json';

export async function POST(req: NextRequest) {
  try {
    // Verify authorization
    const authHeader = req.headers.get('authorization');
    const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
    const cronSecret = process.env.CRON_SECRET;
    const devMode = process.env.DEV_MODE === 'true';

    const isAuthorized =
      devMode ||
      (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) ||
      (cronSecret && authHeader === `Bearer ${cronSecret}`);

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch rates from primary or fallback API
    const ratesData = await fetchRates();
    if (!ratesData) {
      return NextResponse.json(
        { error: 'Failed to fetch exchange rates from all sources' },
        { status: 502 }
      );
    }

    const { usd: rates, date } = ratesData;
    if (!rates || !date) {
      return NextResponse.json(
        { error: 'Invalid response from exchange rate API' },
        { status: 502 }
      );
    }

    // Filter to supported currencies and build rows (exclude USD->USD)
    const supportedCodes = new Set(
      SUPPORTED_CURRENCIES.map((c) => c.code.toLowerCase())
    );

    const rows: {
      base_currency: string;
      target_currency: string;
      rate: number;
      date: string;
    }[] = [];

    for (const [code, rate] of Object.entries(rates)) {
      if (
        code === 'usd' ||
        !supportedCodes.has(code) ||
        typeof rate !== 'number'
      ) {
        continue;
      }
      rows.push({
        base_currency: 'USD',
        target_currency: code.toUpperCase(),
        rate,
        date,
      });
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No valid rates found for supported currencies' },
        { status: 502 }
      );
    }

    // Upsert into currency_exchange_rates
    const sbAdmin = await createAdminClient();
    const { error } = await sbAdmin
      .from('currency_exchange_rates')
      .upsert(rows, {
        onConflict: 'base_currency,target_currency,date',
      });

    if (error) {
      console.error('Failed to upsert exchange rates:', error.message);
      return NextResponse.json(
        { error: 'Database upsert failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      date,
      ratesUpdated: rows.length,
    });
  } catch (error) {
    console.error('Exchange rates cron error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function fetchRates(): Promise<{
  date: string;
  usd: Record<string, number>;
} | null> {
  // Try primary API first
  try {
    const res = await fetch(PRIMARY_API_URL, {
      next: { revalidate: 0 },
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Fall through to fallback
  }

  // Try fallback API
  try {
    const res = await fetch(FALLBACK_API_URL, {
      next: { revalidate: 0 },
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Both failed
  }

  return null;
}
