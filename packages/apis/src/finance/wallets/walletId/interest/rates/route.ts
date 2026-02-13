/**
 * Wallet Interest Rates API
 *
 * GET: Get rate history
 * POST: Add new rate (auto-closes previous)
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { formatDateString } from '@tuturuuu/utils/finance';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    walletId: string;
    wsId: string;
  }>;
}

const createRateSchema = z.object({
  annual_rate: z.number().min(0.01).max(100),
  effective_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/**
 * GET: Get rate history for wallet
 */
export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { walletId, wsId } = await params;
  const permissions = await getPermissions({ wsId });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  if (withoutPermission('view_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Get config
  const { data: config, error: configError } = await supabase
    .from('wallet_interest_configs')
    .select('id')
    .eq('wallet_id', walletId)
    .single();

  if (configError || !config) {
    return NextResponse.json(
      { message: 'Interest tracking not enabled for this wallet' },
      { status: 404 }
    );
  }

  // Get rates
  const { data: rates, error: ratesError } = await supabase
    .from('wallet_interest_rates')
    .select('*')
    .eq('config_id', config.id)
    .order('effective_from', { ascending: false });

  if (ratesError) {
    return NextResponse.json(
      { message: 'Error fetching interest rates' },
      { status: 500 }
    );
  }

  return NextResponse.json(rates);
}

/**
 * POST: Add new rate
 *
 * The database trigger will automatically close the previous rate.
 */
export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { walletId, wsId } = await params;
  const permissions = await getPermissions({ wsId });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  if (withoutPermission('update_wallets')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Validate input
  const body = await req.json();
  const parseResult = createRateSchema.safeParse(body);

  if (!parseResult.success) {
    return NextResponse.json(
      { message: 'Invalid input', errors: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { annual_rate, effective_from } = parseResult.data;

  // Get config
  const { data: config, error: configError } = await supabase
    .from('wallet_interest_configs')
    .select('id')
    .eq('wallet_id', walletId)
    .single();

  if (configError || !config) {
    return NextResponse.json(
      { message: 'Interest tracking not enabled for this wallet' },
      { status: 404 }
    );
  }

  // Create rate
  const { data: rate, error: rateError } = await supabase
    .from('wallet_interest_rates')
    .insert({
      config_id: config.id,
      annual_rate,
      effective_from: effective_from || formatDateString(new Date()),
    })
    .select()
    .single();

  if (rateError) {
    console.error('Error creating interest rate:', rateError);
    return NextResponse.json(
      { message: 'Error creating interest rate' },
      { status: 500 }
    );
  }

  return NextResponse.json(rate, { status: 201 });
}
