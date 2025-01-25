import { createClient } from '@repo/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    timezoneId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { timezoneId: id } = await params;

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

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { timezoneId: id } = await params;

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
