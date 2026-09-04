import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const data = await req.json();
  const { wsId: id } = await params;
  const actor = await resolveSatelliteRequestActor(req, 'finance');
  if (!actor) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const permissions = await getPermissions({ user: actor.user, wsId: id });
  if (!permissions) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  const { admin: sbAdmin } = actor;
  const wsId = permissions.wsId;

  const { error } = await sbAdmin
    .schema('private')
    .from('workspace_wallets')
    .upsert(
      (data?.wallets || []).map((p: Wallet) => ({
        ...p,
        ws_id: wsId,
      }))
    )
    .eq('id', data.id);

  if (error) {
    console.error('Error migrating workspace wallets:', error);
    return NextResponse.json(
      { message: 'Error migrating workspace wallets' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
