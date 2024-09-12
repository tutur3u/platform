import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    wsId: string;
  };
}

export async function GET(_: Request, { params: { wsId: id } }: Params) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('inventory_suppliers')
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

export async function POST(req: Request, { params: { wsId: id } }: Params) {
  const supabase = createClient();

  const data = await req.json();

  const { error } = await supabase.from('inventory_suppliers').insert({
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
