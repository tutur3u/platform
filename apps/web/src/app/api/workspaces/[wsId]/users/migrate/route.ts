import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    wsId: string;
  };
}

export async function PUT(req: Request, { params: { wsId } }: Params) {
  const supabase = createRouteHandlerClient({ cookies });

  const data = await req.json();

  const { error } = await supabase.from('workspace_users').upsert(
    (data?.users || []).map((u: WorkspaceUser) => ({
      ...u,
      ws_id: wsId,
    }))
  );

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error migrating workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
