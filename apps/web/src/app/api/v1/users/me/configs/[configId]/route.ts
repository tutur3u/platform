import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/api-auth';

interface Params {
  params: Promise<{
    configId: string;
  }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { data: authData, error: authError } = await authorizeRequest(req);
  if (authError || !authData)
    return (
      authError ||
      NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    );

  const { user, supabase } = authData;
  const { configId: id } = await params;

  const { data, error } = await supabase
    .from('user_configs')
    .select('value')
    .eq('user_id', user.id)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching user config:', error);
    return NextResponse.json(
      { message: 'Error fetching user config' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({}, { status: 404 });
  }

  return NextResponse.json({ value: data.value });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { data: authData, error: authError } = await authorizeRequest(req);
  if (authError || !authData)
    return (
      authError ||
      NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    );

  const { user, supabase } = authData;
  const { configId: id } = await params;

  const bodySchema = z.object({
    value: z.string().optional(),
  });
  const parsedBody = bodySchema.safeParse(await req.json());

  if (!parsedBody.success) {
    return NextResponse.json(
      { message: 'Invalid request data', errors: parsedBody.error.issues },
      { status: 400 }
    );
  }

  const { value } = parsedBody.data;

  const { error } = await supabase.from('user_configs').upsert(
    [
      {
        id,
        user_id: user.id,
        value: value ?? '',
        updated_at: new Date().toISOString(),
      },
    ],
    {
      onConflict: 'user_id,id',
    }
  );

  if (error) {
    console.error('Error upserting user config:', error);
    return NextResponse.json(
      { message: 'Error upserting user config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { data: authData, error: authError } = await authorizeRequest(req);
  if (authError || !authData)
    return (
      authError ||
      NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    );

  const { user, supabase } = authData;
  const { configId: id } = await params;

  const { error } = await supabase
    .from('user_configs')
    .delete()
    .eq('user_id', user.id)
    .eq('id', id);

  if (error) {
    console.error('Error deleting user config:', error);
    return NextResponse.json(
      { message: 'Error deleting user config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
