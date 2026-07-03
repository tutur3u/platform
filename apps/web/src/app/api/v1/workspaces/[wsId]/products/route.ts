import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  createInventoryProductResponse,
  InventoryProductCreateSchema,
} from '@tuturuuu/inventory-core/product-create';

export const ProductCreateSchema = InventoryProductCreateSchema;

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const wsId = await normalizeWorkspaceId(id, supabase);

  const parsed = InventoryProductCreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const { user } = await resolveAuthenticatedSessionUser(supabase);

  return createInventoryProductResponse({
    actorAuthUserId: user?.id ?? null,
    payload: parsed.data,
    permissions,
    sbAdmin,
    wsId,
  });
}
