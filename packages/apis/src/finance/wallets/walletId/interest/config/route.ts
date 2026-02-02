/**
 * Wallet Interest Config API
 *
 * PUT: Update config (tier, enabled status)
 * DELETE: Disable/remove interest tracking
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    walletId: string;
    wsId: string;
  }>;
}

const updateConfigSchema = z.object({
  zalopay_tier: z.enum(['standard', 'gold', 'diamond']).nullable().optional(),
  enabled: z.boolean().optional(),
  tracking_start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  tracking_end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

/**
 * PUT: Update interest config
 */
export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { walletId, wsId } = await params;
  const { withoutPermission } = await getPermissions({ wsId });

  if (withoutPermission('update_wallets')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Validate input
  const body = await req.json();
  const parseResult = updateConfigSchema.safeParse(body);

  if (!parseResult.success) {
    return NextResponse.json(
      { message: 'Invalid input', errors: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { zalopay_tier, enabled, tracking_start_date, tracking_end_date } =
    parseResult.data;

  // Get existing config
  const { data: config, error: configError } = await supabase
    .from('wallet_interest_configs')
    .select('*')
    .eq('wallet_id', walletId)
    .single();

  if (configError || !config) {
    return NextResponse.json(
      { message: 'Interest tracking not enabled for this wallet' },
      { status: 404 }
    );
  }

  // Build update object
  const updates: Record<string, unknown> = {};

  if (zalopay_tier !== undefined && config.provider === 'zalopay') {
    updates.zalopay_tier = zalopay_tier;
  }

  if (enabled !== undefined) {
    updates.enabled = enabled;
  }

  if (tracking_start_date !== undefined) {
    updates.tracking_start_date = tracking_start_date;
  }

  if (tracking_end_date !== undefined) {
    updates.tracking_end_date = tracking_end_date;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { message: 'No valid updates provided' },
      { status: 400 }
    );
  }

  // Update config
  const { data: updatedConfig, error: updateError } = await supabase
    .from('wallet_interest_configs')
    .update(updates)
    .eq('id', config.id)
    .select()
    .single();

  if (updateError) {
    console.error('Error updating interest config:', updateError);
    return NextResponse.json(
      { message: 'Error updating interest config' },
      { status: 500 }
    );
  }

  return NextResponse.json(updatedConfig);
}

/**
 * DELETE: Remove interest tracking
 */
export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { walletId, wsId } = await params;
  const { withoutPermission } = await getPermissions({ wsId });

  if (withoutPermission('update_wallets')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Delete config (rates will cascade delete)
  const { error } = await supabase
    .from('wallet_interest_configs')
    .delete()
    .eq('wallet_id', walletId);

  if (error) {
    console.error('Error deleting interest config:', error);
    return NextResponse.json(
      { message: 'Error deleting interest config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Interest tracking disabled' });
}
