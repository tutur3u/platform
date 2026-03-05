import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions,normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
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

export async function PUT(req: Request, { params }: Params) {
  const { tagId, wsId } = await params;
  const parsed = TagUpdateSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request data', errors: parsed.error.issues },
      { status: 400 }
    );
  }
  const supabase = await createClient(req);

  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

  const permissions = await getPermissions({ wsId: normalizedWsId, request: req });
  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (permissions.withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }


  const { data, error } = await supabase
    .from('transaction_tags')
    .update(parsed.data)
    .eq('id', tagId)
    .eq('ws_id', normalizedWsId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.log(error);
    return NextResponse.json({ message: 'Error updating tag' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ message: 'Tag not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(req: Request, { params }: Params) {
  const { tagId, wsId } = await params;
  const supabase = await createClient(req);
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const permissions = await getPermissions({ wsId: normalizedWsId, request: req });
  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (permissions.withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from('transaction_tags')
    .delete()
    .eq('id', tagId)
    .eq('ws_id', normalizedWsId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.log(error);
    return NextResponse.json({ message: 'Error deleting tag' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ message: 'Tag not found' }, { status: 404 });
  }

  return NextResponse.json({ message: 'success' });
}
