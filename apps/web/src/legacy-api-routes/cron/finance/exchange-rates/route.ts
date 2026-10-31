import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { seedExchangeRates } from '@/lib/finance/seed-exchange-rates';
import { withCronLogDrain } from '@/lib/infrastructure/log-drain';

export async function POST(req: NextRequest) {
  return withCronLogDrain(
    {
      jobId: 'finance-exchange-rates',
      path: '/api/cron/finance/exchange-rates',
      request: req,
    },
    () => handlePOST(req)
  );
}

async function handlePOST(req: NextRequest) {
  try {
    // Verify authorization
    const authHeader = req.headers.get('authorization');
    const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
    const cronSecret = process.env.CRON_SECRET;

    const isAuthorized =
      (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) ||
      (cronSecret && authHeader === `Bearer ${cronSecret}`);

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return seedExchangeRates();
  } catch (error) {
    console.error('Exchange rates cron error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
