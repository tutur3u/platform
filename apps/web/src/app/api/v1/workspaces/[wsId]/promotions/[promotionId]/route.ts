import { createClient } from '@ncthub/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    promotionId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { promotionId } = await params;

  const { error } = await supabase
    .from('workspace_promotions')
    .update({
      ...data,
      // TODO: better handling boolean value, as expand to further units
      unit: undefined,
      use_ratio: data.unit === 'percentage',
    })
    .eq('id', promotionId);

  if (error) {
    // TODO: logging
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating promotion' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { promotionId } = await params;

  const { error } = await supabase
    .from('workspace_promotions')
    .delete()
    .eq('id', promotionId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace user' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
