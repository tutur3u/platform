import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    categoryId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { categoryId } = await params;

  const { data, error } = await supabase
    .from('transaction_categories')
    .select('*')
    .eq('id', categoryId)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching transaction category' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { categoryId } = await params;

  const { error } = await supabase
    .from('transaction_categories')
    .update(data)
    .eq('id', categoryId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating transaction category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { categoryId } = await params;

  const { error } = await supabase
    .from('transaction_categories')
    .delete()
    .eq('id', categoryId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating transaction category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
