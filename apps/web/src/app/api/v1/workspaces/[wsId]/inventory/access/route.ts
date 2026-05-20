import { NextResponse } from 'next/server';
import { isInventoryEnabled } from '@/lib/inventory/access';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id, {
    requireInventoryEnabled: false,
  });

  if (!authorization.ok) return authorization.response;

  return NextResponse.json({
    enabled: await isInventoryEnabled(authorization.value.wsId),
  });
}
