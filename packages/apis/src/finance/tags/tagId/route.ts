import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  type FinanceRouteAuthContext,
  type FinanceRouteContext,
  getFinanceRouteContext,
} from '../../request-access';

interface Params {
  params: Promise<{
    tagId: string;
    wsId: string;
  }>;
}

const TagUpdateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  description: z.string().nullable().optional(),
});

const TagIdSchema = z.guid();

type AuthorizedTagRequest = {
  normalizedWsId: string;
  sbAdmin: FinanceRouteContext['sbAdmin'];
};

async function authorizeTagRequest(
  req: Request,
  wsId: string,
  authContext?: FinanceRouteAuthContext
): Promise<AuthorizedTagRequest | { response: NextResponse }> {
  const access = await getFinanceRouteContext(req, wsId, authContext);

  if (access.response) {
    return { response: access.response };
  }

  const { normalizedWsId, permissions, sbAdmin } = access.context;

  if (permissions.withoutPermission('manage_finance')) {
    return {
      response: NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    };
  }

  return { normalizedWsId, sbAdmin };
}

export async function PUT(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { tagId, wsId } = await params;

  if (!TagIdSchema.safeParse(tagId).success) {
    return NextResponse.json(
      { message: 'Invalid tagId: must be a valid UUID' },
      { status: 400 }
    );
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = TagUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request data', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const authorization = await authorizeTagRequest(req, wsId, authContext);

  if ('response' in authorization) {
    return authorization.response;
  }

  const { normalizedWsId, sbAdmin } = authorization;

  const { data, error } = await sbAdmin
    .from('transaction_tags')
    .update(parsed.data)
    .eq('id', tagId)
    .eq('ws_id', normalizedWsId)
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { message: 'Error updating tag' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ message: 'Tag not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { tagId, wsId } = await params;

  if (!TagIdSchema.safeParse(tagId).success) {
    return NextResponse.json(
      { message: 'Invalid tagId: must be a valid UUID' },
      { status: 400 }
    );
  }

  const authorization = await authorizeTagRequest(req, wsId, authContext);

  if ('response' in authorization) {
    return authorization.response;
  }

  const { normalizedWsId, sbAdmin } = authorization;

  const { data, error } = await sbAdmin
    .from('transaction_tags')
    .delete()
    .eq('id', tagId)
    .eq('ws_id', normalizedWsId)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { message: 'Error deleting tag' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ message: 'Tag not found' }, { status: 404 });
  }

  return NextResponse.json({ message: 'success' });
}
