import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const data = await req.json();
  const { wsId: id } = await params;
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: id,
    userId: user.id,
    supabase: supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { error: 'Failed to verify workspace membership' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { error } = await sbAdmin
    .from('workspace_wallets')
    .upsert(
      (data?.wallets || []).map((p: Wallet) => ({
        ...p,
        ws_id: id,
      }))
    )
    .eq('id', data.id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error migrating workspace wallets' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
