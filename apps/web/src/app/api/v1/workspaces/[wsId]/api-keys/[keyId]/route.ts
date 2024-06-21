import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    keyId: string;
  };
}

export async function PUT(req: Request, { params: { keyId: id } }: Params) {
  const supabase = createClient();

  const data = await req.json();

  const { error } = await supabase
    .from('workspace_api_keys')
    .update(data)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params: { keyId: id } }: Params) {
  const supabase = createClient();

  const { error } = await supabase
    .from('workspace_api_keys')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
