import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    wsId: string;
  };
}

export async function GET(_: Request, { params: { wsId: id } }: Params) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase
    .from('workspace_users')
    .select('*')
    .eq('ws_id', id);

  if (error)
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );

  return NextResponse.json(data);
}

export async function POST(req: Request, { params: { wsId: id } }: Params) {
  const supabase = createRouteHandlerClient({ cookies });

  const data = await req.json();

  const { error } = await supabase.from('workspace_users').insert({
    ...data,
    ws_id: id,
  });

  if (error)
    return NextResponse.json(
      { message: 'Error creating workspace users' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params: { wsId: id } }: Params) {
  const supabase = createRouteHandlerClient({ cookies });

  const { error } = await supabase
    .from('workspace_users')
    .delete()
    .eq('ws_id', id);

  if (error)
    return NextResponse.json(
      { message: 'Error deleting workspace users' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success' });
}
