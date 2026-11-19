import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { z } from 'zod';

type Context = {
  params: Promise<{ wsId: string; walletId: string; checkpointId: string }>;
};

const ids = z.object({ walletId: z.uuid(), checkpointId: z.uuid() });
const review = z.strictObject({
  reviewed: z.boolean(),
  expected_updated_at: z.iso.datetime({ offset: true }),
});

export async function PUT(request: Request, { params }: Context) {
  const { wsId, walletId, checkpointId } = await params;
  if (!ids.safeParse({ walletId, checkpointId }).success) {
    return Response.json({ message: 'Invalid checkpoint' }, { status: 400 });
  }

  const access = await getFinanceRouteContext(
    request,
    wsId,
    await resolveFinanceRouteAuthContext(request)
  );
  if (access.response) return access.response;

  const { normalizedWsId, permissions, sbAdmin, user } = access.context;
  if (
    permissions.withoutPermission('view_transactions') ||
    permissions.withoutPermission('update_wallets')
  ) {
    return Response.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const payload = review.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return Response.json(
      { message: 'Invalid checkpoint review' },
      { status: 400 }
    );
  }

  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('set_wallet_checkpoint_review', {
      _ws_id: normalizedWsId,
      _wallet_id: walletId,
      _checkpoint_id: checkpointId,
      _actor_id: user.id,
      _expected_updated_at: payload.data.expected_updated_at,
      _reviewed: payload.data.reviewed,
    });
  if (error) {
    if (error.code === 'PT409') {
      return Response.json({ message: 'Checkpoint changed' }, { status: 409 });
    }
    if (error.code === 'PGRST202' || error.code === '42883') {
      return Response.json(
        { message: 'Checkpoint reviews unavailable' },
        { status: 503 }
      );
    }
    console.error('Error saving checkpoint review', error);
    return Response.json(
      { message: 'Error saving checkpoint review' },
      { status: 500 }
    );
  }
  if (!data) {
    return Response.json({ message: 'Checkpoint not found' }, { status: 404 });
  }
  return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
