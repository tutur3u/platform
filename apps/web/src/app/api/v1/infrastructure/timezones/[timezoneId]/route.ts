import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    timezoneId: string;
  };
}

export async function PUT(
  req: Request,
  { params: { timezoneId: id } }: Params
) {
  const supabase = createClient();

  const data = await req.json();

  const { error } = await supabase.from('timezones').upsert(data).eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating timezone' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(
  _: Request,
  { params: { timezoneId: id } }: Params
) {
  const supabase = createClient();

  const { error } = await supabase.from('timezones').delete().eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting timezone' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
