import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    unitId: string;
  };
}

export async function PUT(req: Request, { params: { unitId: id } }: Params) {
  const supabase = createClient();
  const data = await req.json();

  const { error } = await supabase
    .from('inventory_units')
    .update(data)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating product category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params: { unitId: id } }: Params) {
  const supabase = createClient();

  const { error } = await supabase
    .from('inventory_units')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting product category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
