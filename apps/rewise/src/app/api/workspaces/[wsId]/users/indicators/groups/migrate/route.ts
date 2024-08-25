import { VitalGroup } from '@/types/primitives/VitalGroup';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    wsId: string;
  };
}

export async function PUT(req: Request, { params: { wsId: id } }: Params) {
  const supabase = createClient();

  const data = await req.json();

  const { error } = await supabase
    // .from('workspace_indicators')
    .from('healthcare_vital_groups')
    .upsert(
      (data?.groups || []).map((u: VitalGroup) => ({
        ...u,
        ws_id: id,
      }))
    )
    .eq('id', data.id);

  if (error)
    return NextResponse.json(
      { message: 'Error migrating workspace indicator groups' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success' });
}
