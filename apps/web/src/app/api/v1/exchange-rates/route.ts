import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import { connection, NextResponse } from 'next/server';
import { createLegacyHeadHandler } from '@/legacy-api-routes/head';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';

function reply(data: unknown, options: { status?: number } = {}) {
  return NextResponse.json(data, {
    ...options,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export const GET = withSessionAuth(
  async (_request, { supabase }) => {
    await connection();
    try {
      // Get the latest date's exchange rates
      const { data: latestDate, error: latestDateError } = await supabase
        .from('currency_exchange_rates')
        .select('date')
        .eq('base_currency', 'USD')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestDateError) {
        return reply({ error: 'Failed to fetch rates' }, { status: 500 });
      }

      // If no rates exist yet, trigger the cron endpoint to seed initial data
      if (!latestDate) {
        await triggerInitialFetch();

        // Re-query after seeding
        const { data: seededDate, error: seededDateError } = await supabase
          .from('currency_exchange_rates')
          .select('date')
          .eq('base_currency', 'USD')
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (seededDateError) {
          return reply({ error: 'Failed to fetch rates' }, { status: 500 });
        }

        if (!seededDate) {
          return reply({ data: [], date: null });
        }

        const { data: rates, error: seededRatesError } = await supabase
          .from('currency_exchange_rates')
          .select('base_currency, target_currency, rate, date')
          .eq('base_currency', 'USD')
          .eq('date', seededDate.date)
          .order('target_currency');

        if (seededRatesError) {
          return reply({ error: 'Failed to fetch rates' }, { status: 500 });
        }

        return reply({
          data: rates ?? [],
          date: seededDate.date,
        });
      }

      const { data: rates, error } = await supabase
        .from('currency_exchange_rates')
        .select('base_currency, target_currency, rate, date')
        .eq('base_currency', 'USD')
        .eq('date', latestDate.date)
        .order('target_currency');

      if (error) {
        return reply({ error: 'Failed to fetch rates' }, { status: 500 });
      }

      return reply({
        data: rates ?? [],
        date: latestDate.date,
      });
    } catch {
      return reply({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH }
);

export const HEAD = createLegacyHeadHandler(GET);

async function triggerInitialFetch() {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    getLocalInternalAppUrl('platform', 'http://localhost:7803');
  const serviceKey = process.env.SUPABASE_SECRET_KEY;

  if (!serviceKey) return;

  try {
    await fetch(`${baseUrl}/api/cron/finance/exchange-rates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
    });
  } catch {
    // Seeding failed silently — rates will be populated on next cron run
  }
}
