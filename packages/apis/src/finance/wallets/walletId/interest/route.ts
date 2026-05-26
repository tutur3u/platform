/**
 * Wallet Interest API - Main endpoint
 *
 * GET: Get interest summary with projections
 * POST: Enable interest tracking (create config)
 */
import type { CreateInterestConfigInput } from '@tuturuuu/types';
import { formatDateString } from '@tuturuuu/utils/finance';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAccessibleWallet } from '../../wallet-access';

interface Params {
  params: Promise<{
    walletId: string;
    wsId: string;
  }>;
}

const createConfigSchema = z.object({
  provider: z.enum(['momo', 'zalopay']),
  zalopay_tier: z.enum(['standard', 'gold', 'diamond']).nullable().optional(),
  initial_rate: z.number().min(0).max(100).optional(),
  tracking_start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

/**
 * GET: Get interest summary with calculations and projections
 */
export async function GET(req: Request, { params }: Params) {
  const { walletId, wsId } = await params;
  const access = await getAccessibleWallet({
    req,
    wsId,
    walletId,
    requiredPermission: 'view_transactions',
    select: 'id',
  });

  if (access.response) {
    return access.response;
  }

  const { data: summary, error: summaryError } = await access.context.sbAdmin
    .schema('private')
    .rpc('get_wallet_interest_summary', {
      _actor_id: access.context.userId,
      _wallet_id: walletId,
      _ws_id: access.context.normalizedWsId,
    });

  if (summaryError) {
    console.error('Error fetching wallet interest summary:', summaryError);
    return NextResponse.json(
      { message: 'Error fetching interest summary' },
      { status: 500 }
    );
  }

  const payload = summary as { error?: string } | null;
  if (payload?.error === 'wallet_not_found') {
    return NextResponse.json({ message: 'Wallet not found' }, { status: 404 });
  }

  if (payload?.error) {
    return NextResponse.json(
      { message: 'Error fetching interest summary' },
      { status: 500 }
    );
  }

  return NextResponse.json(summary);
}

/**
 * POST: Enable interest tracking for a wallet
 */
export async function POST(req: Request, { params }: Params) {
  const { walletId, wsId } = await params;
  const access = await getAccessibleWallet({
    req,
    wsId,
    walletId,
    requiredPermission: 'update_wallets',
    select: 'id',
  });

  if (access.response) {
    return access.response;
  }

  // Validate input
  const body = await req.json();
  const parseResult = createConfigSchema.safeParse(body);

  if (!parseResult.success) {
    return NextResponse.json(
      { message: 'Invalid input', errors: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const input: CreateInterestConfigInput = {
    wallet_id: walletId,
    ...parseResult.data,
  };

  // Check if config already exists
  const { data: existingConfig } = await access.context.supabase
    .from('wallet_interest_configs')
    .select('id')
    .eq('wallet_id', walletId)
    .single();

  if (existingConfig) {
    return NextResponse.json(
      { message: 'Interest tracking already enabled for this wallet' },
      { status: 409 }
    );
  }

  // Determine tracking start date - default to today if not provided
  const trackingStartDate =
    input.tracking_start_date ?? formatDateString(new Date());

  // Create config
  const { data: config, error: configError } = await access.context.supabase
    .from('wallet_interest_configs')
    .insert({
      wallet_id: walletId,
      provider: input.provider,
      zalopay_tier:
        input.provider === 'zalopay'
          ? (input.zalopay_tier ?? 'standard')
          : null,
      enabled: true,
      tracking_start_date: trackingStartDate,
    })
    .select()
    .single();

  if (configError || !config) {
    console.error('Error creating interest config:', configError);
    return NextResponse.json(
      { message: 'Error creating interest config' },
      { status: 500 }
    );
  }

  // Determine initial rate
  const { getDefaultRate } = await import('@tuturuuu/types');
  const initialRate =
    input.initial_rate ?? getDefaultRate(input.provider, input.zalopay_tier);

  // Create initial rate entry
  const { error: rateError } = await access.context.supabase
    .from('wallet_interest_rates')
    .insert({
      config_id: config.id,
      annual_rate: initialRate,
      effective_from: formatDateString(new Date()),
    });

  if (rateError) {
    console.error('Error creating initial rate:', rateError);
    // Config was created but rate failed - still return success with warning
    return NextResponse.json({
      config,
      warning: 'Config created but initial rate could not be set',
    });
  }

  return NextResponse.json(config, { status: 201 });
}
