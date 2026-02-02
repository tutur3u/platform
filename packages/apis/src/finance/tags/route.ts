import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  // TODO: Migrate to another permission
  if (withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from('transaction_tags')
    .select('*')
    .eq('ws_id', wsId)
    .order('name');

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching tags' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

const TagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default('#3b82f6'),
  description: z.string().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  // TODO: Migrate to another permission
  if (withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const parsed = TagSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request data', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { name, color, description } = parsed.data;

  const { data, error } = await supabase
    .from('transaction_tags')
    .insert({
      ws_id: wsId,
      name,
      color,
      description: description || null,
    })
    .select()
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating tag' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
