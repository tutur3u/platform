import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

interface Params {
  params: Promise<{ wsId: string }>;
}

const secretSchema = z.object({
  name: z.string().trim().min(1).max(128),
  value: z.string().max(16_384),
});

export async function GET(_: Request, { params }: Params) {
  await connection();
  const auth = await authorizeInfrastructureAdminRequest();
  if (!auth.ok) return auth.response;

  const { wsId } = await params;
  const { data, error } = await auth.sbAdmin
    .from('workspace_secrets')
    .select('*')
    .eq('ws_id', wsId)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching infrastructure workspace secrets:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace API configs' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const auth = await authorizeInfrastructureAdminRequest();
  if (!auth.ok) return auth.response;

  const parsed = secretSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten(), message: 'Invalid input' },
      { status: 400 }
    );
  }

  const { wsId } = await params;
  const { error } = await auth.sbAdmin.from('workspace_secrets').insert({
    ...parsed.data,
    ws_id: wsId,
  });

  if (error) {
    console.error('Error creating infrastructure workspace secret:', error);
    return NextResponse.json(
      { message: 'Error creating workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
