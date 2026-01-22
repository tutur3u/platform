import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
    roleId: string;
    walletId: string;
  }>;
}

const UpdateViewingWindowSchema = z
  .object({
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
    custom_days: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.viewing_window === 'custom') {
        return (
          data.custom_days !== undefined &&
          data.custom_days !== null &&
          data.custom_days > 0
        );
      }
      return true;
    },
    {
      message:
        'custom_days is required and must be positive when viewing_window is "custom"',
      path: ['custom_days'],
    }
  );

// PUT - Update viewing window for a whitelisted wallet
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const supabase = await createClient();
    const { wsId, roleId, walletId } = await params;
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
    const validationResult = UpdateViewingWindowSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          message: 'Invalid request body',
          errors: validationResult.error.issues,
        },
        { status: 400 }
      );
    }

    const { viewing_window, custom_days } = validationResult.data;

    const { data, error } = await supabase
      .from('workspace_role_wallet_whitelist')
      .update({
        viewing_window,
        custom_days: viewing_window === 'custom' ? custom_days : null,
      })
      .eq('role_id', roleId)
      .eq('wallet_id', walletId)
      .select()
      .single();

    if (error) {
      console.log(error);
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Wallet whitelist entry not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error updating wallet whitelist' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating wallet whitelist:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Remove wallet from role whitelist
export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, roleId, walletId } = await params;
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_workspace_roles')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from('workspace_role_wallet_whitelist')
    .delete()
    .eq('role_id', roleId)
    .eq('wallet_id', walletId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error removing wallet from whitelist' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
