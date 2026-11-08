import { connection, NextResponse } from 'next/server';
import { createLegacyHeadHandler } from '@/legacy-api-routes/head';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';
import { seedExchangeRates } from '@/lib/finance/seed-exchange-rates';

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

      // Seed initial data when no rates exist yet.
      if (!latestDate) {
        const seedResult = await seedExchangeRates();
        if (!seedResult.ok) {
          console.error('Failed to seed exchange rates', {
            status: seedResult.status,
          });
          return reply({ error: 'Failed to fetch rates' }, { status: 502 });
        }

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
