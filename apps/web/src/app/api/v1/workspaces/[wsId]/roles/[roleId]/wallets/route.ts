import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
    roleId: string;
  }>;
}

// GET - List whitelisted wallets for a role
export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, roleId } = await params;
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_workspace_roles')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from('workspace_role_wallet_whitelist')
    .select(
      `
      id,
      wallet_id,
      viewing_window,
      custom_days,
      created_at,
      workspace_wallets:wallet_id (
        id,
        name,
        balance,
        currency,
        type
      )
    `
    )
    .eq('role_id', roleId)
    .order('created_at', { ascending: false });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching wallet whitelist' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

// POST - Add wallet to role whitelist
export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, roleId } = await params;
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_workspace_roles')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const body = await req.json();

  const schema = z
    .object({
      wallet_id: z.string(),
      viewing_window: z.enum([
        '1_day',
        '3_days',
        '7_days',
        '2_weeks',
        '1_month',
        '1_quarter',
        '1_year',
        'custom',
      ]),
      custom_days: z.number().int().positive().optional(),
    })
    .refine(
      (data) =>
        data.viewing_window !== 'custom' ||
        (data.custom_days !== undefined && data.custom_days > 0),
      {
        message:
          'custom_days must be a positive integer when viewing_window is "custom"',
        path: ['custom_days'],
      }
    );

  let wallet_id: string;
  let viewing_window:
    | '1_day'
    | '3_days'
    | '7_days'
    | '2_weeks'
    | '1_month'
    | '1_quarter'
    | '1_year'
    | 'custom';
  let custom_days: number | undefined;

  try {
    const validatedData = await schema.parseAsync(body);
    wallet_id = validatedData.wallet_id;
    viewing_window = validatedData.viewing_window;
    custom_days = validatedData.custom_days;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  // Validate wallet belongs to workspace
  const { data: wallet, error: walletError } = await supabase
    .from('workspace_wallets')
    .select('id, ws_id')
    .eq('id', wallet_id)
    .eq('ws_id', wsId)
    .single();

  if (walletError || !wallet) {
    return NextResponse.json(
      { message: 'Wallet not found or does not belong to workspace' },
      { status: 404 }
    );
  }

  // Validate role belongs to workspace
  const { data: role, error: roleError } = await supabase
    .from('workspace_roles')
    .select('id, ws_id')
    .eq('id', roleId)
    .eq('ws_id', wsId)
    .single();

  if (roleError || !role) {
    return NextResponse.json(
      { message: 'Role not found or does not belong to workspace' },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from('workspace_role_wallet_whitelist')
    .insert({
      role_id: roleId,
      wallet_id,
      viewing_window,
      custom_days: viewing_window === 'custom' ? custom_days : null,
    })
    .select()
    .single();

  if (error) {
    console.log(error);
    // Check if it's a unique constraint violation
    if (error.code === '23505') {
      return NextResponse.json(
        { message: 'Wallet is already whitelisted for this role' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { message: 'Error adding wallet to whitelist' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
