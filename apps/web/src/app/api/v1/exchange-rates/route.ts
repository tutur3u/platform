import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the latest date's exchange rates
    const { data: latestDate } = await supabase
      .from('currency_exchange_rates')
      .select('date')
      .eq('base_currency', 'USD')
      .order('date', { ascending: false })
      .limit(1)
      .single();

    // If no rates exist yet, trigger the cron endpoint to seed initial data
    if (!latestDate) {
      await triggerInitialFetch();

      // Re-query after seeding
      const { data: seededDate } = await supabase
        .from('currency_exchange_rates')
        .select('date')
        .eq('base_currency', 'USD')
        .order('date', { ascending: false })
        .limit(1)
        .single();

      if (!seededDate) {
        return NextResponse.json({ data: [], date: null });
      }

      const { data: rates } = await supabase
        .from('currency_exchange_rates')
        .select('base_currency, target_currency, rate, date')
        .eq('base_currency', 'USD')
        .eq('date', seededDate.date)
        .order('target_currency');

      return NextResponse.json({
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
      return NextResponse.json(
        { error: 'Failed to fetch rates' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: rates ?? [],
      date: latestDate.date,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function triggerInitialFetch() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:7803';
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
