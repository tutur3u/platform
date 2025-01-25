import { createClient } from '@repo/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { wsId } = await params;

  const { error } = await supabase.from('workspace_promotions').insert({
    ...data,
    ws_id: wsId,
    // TODO: better handling boolean value, as expand to further units
    unit: undefined,
    use_ratio: data.unit === 'percentage',
  });

  if (error) {
    // TODO: logging
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating promotion' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
