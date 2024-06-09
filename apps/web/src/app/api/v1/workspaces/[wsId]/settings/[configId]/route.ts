import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    wsId: string;
    configId: string;
  };
}

export async function PUT(
  req: Request,
  { params: { wsId, configId: id } }: Params
) {
  const supabase = createRouteHandlerClient({ cookies });

  const { value } = await req.json();

  const { error } = await supabase
    .from('workspace_configs')
    .upsert({
      id,
      ws_id: wsId,
      value: value || '',
      updated_at: new Date().toISOString(),
    })
    .eq('ws_id', wsId)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error upserting workspace config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
