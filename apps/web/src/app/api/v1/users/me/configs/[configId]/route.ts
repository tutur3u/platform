import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    configId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { configId: id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

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

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { configId: id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { value } = await req.json();

  const { error } = await supabase.from('user_configs').upsert(
    {
      id,
      user_id: user.id,
      value: value ?? '',
      updated_at: new Date().toISOString(),
    },
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

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { configId: id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

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
