import { createClient } from '@ncthub/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const { data, error } = await supabase
    .from('product_categories')
    .select('*')
    .eq('ws_id', id)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace user groups' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { wsId: id } = await params;

  const { error } = await supabase.from('product_categories').insert({
    ...data,
    ws_id: id,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace user group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
