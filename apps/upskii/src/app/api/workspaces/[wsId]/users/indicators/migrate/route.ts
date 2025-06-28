import { createClient } from '@tuturuuu/supabase/next/server';
import type { Vital } from '@tuturuuu/types/primitives/Vital';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { wsId: id } = await params;

  const { error } = await supabase
    // .from('workspace_indicators')
    .from('healthcare_vitals')
    .upsert(
      (data?.indicators || []).map((u: Vital) => ({
        ...u,
        ws_id: id,
      }))
    )
    .eq('id', data.id);

  if (error)
    return NextResponse.json(
      { message: 'Error migrating workspace indicators' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success' });
}
