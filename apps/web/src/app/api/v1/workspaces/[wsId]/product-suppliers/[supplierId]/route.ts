import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    supplierId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { supplierId: id } = await params;

  const { error } = await supabase
    .from('inventory_suppliers')
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

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { supplierId: id } = await params;

  const { error } = await supabase
    .from('inventory_suppliers')
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
