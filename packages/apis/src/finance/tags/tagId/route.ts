import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

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

const TagIdSchema = z.string().uuid();

type AuthorizedTagRequest = {
  normalizedWsId: string;
  supabase: TypedSupabaseClient;
  sbAdmin: TypedSupabaseClient;
};

async function authorizeTagRequest(
  req: Request,
  wsId: string
): Promise<AuthorizedTagRequest | { response: NextResponse }> {
  const supabase = await createClient(req);

  let normalizedWsId: string;

  try {
    normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  } catch {
    return {
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const permissions = await getPermissions({
    wsId: normalizedWsId,
    request: req,
  });

  if (!permissions) {
    return {
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  if (permissions.withoutPermission('manage_finance')) {
    return {
      response: NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    };
  }

  const sbAdmin = await createAdminClient();

  return { normalizedWsId, supabase, sbAdmin };
}

export async function PUT(req: Request, { params }: Params) {
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

  const authorization = await authorizeTagRequest(req, wsId);

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
    console.log(error);
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

export async function DELETE(req: Request, { params }: Params) {
  const { tagId, wsId } = await params;

  if (!TagIdSchema.safeParse(tagId).success) {
    return NextResponse.json(
      { message: 'Invalid tagId: must be a valid UUID' },
      { status: 400 }
    );
  }

  const authorization = await authorizeTagRequest(req, wsId);

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
    console.log(error);
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
