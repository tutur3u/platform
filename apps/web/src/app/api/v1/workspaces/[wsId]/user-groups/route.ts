import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const CreateUserGroupSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1),
    is_guest: z.boolean().default(false),
    starting_date: z.string().datetime().nullable().optional(),
    ending_date: z.string().datetime().nullable().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.starting_date && data.ending_date) {
        return new Date(data.ending_date) >= new Date(data.starting_date);
      }
      return true;
    },
    {
      message: 'End date must be after or equal to start date',
      path: ['ending_date'],
    }
  );

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { withoutPermission } = permissions;
  if (withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user groups' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from('workspace_user_groups')
    .select('*')
    .eq('ws_id', wsId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace user groups' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { withoutPermission } = permissions;
  if (withoutPermission('create_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create user groups' },
      { status: 403 }
    );
  }

  const data = CreateUserGroupSchema.safeParse(await req.json());

  if (!data.success) {
    return NextResponse.json(
      { message: 'Invalid data', errors: data.error.issues },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('workspace_user_groups')
    .insert({
      name: data.data.name,
      is_guest: data.data.is_guest,
      starting_date: data.data.starting_date ?? null,
      ending_date: data.data.ending_date ?? null,
      notes: data.data.notes ?? null,
      ws_id: wsId,
    })
    .select('id')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace user group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
