import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    categoryId: string;
  };
}

export async function GET(_: Request, { params: { categoryId: id } }: Params) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('transaction_categories')
    .select('*')
    .eq('id', id)
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

export async function PUT(
  req: Request,
  { params: { categoryId: id } }: Params
) {
  const supabase = createClient();
  const data = await req.json();

  const { error } = await supabase
    .from('transaction_categories')
    .update(data)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating transaction category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(
  _: Request,
  { params: { categoryId: id } }: Params
) {
  const supabase = createClient();

  const { error } = await supabase
    .from('transaction_categories')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating transaction category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
