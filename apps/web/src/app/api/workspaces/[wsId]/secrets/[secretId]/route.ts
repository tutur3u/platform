import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    secretId: string;
  };
}

export async function PUT(req: Request, { params: { secretId: id } }: Params) {
  const supabase = createRouteHandlerClient({ cookies });

  const data = await req.json();

  const { error } = await supabase
    .from('workspace_secrets')
    .update(data)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params: { secretId: id } }: Params) {
  const supabase = createRouteHandlerClient({ cookies });

  const { error } = await supabase
    .from('workspace_secrets')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
