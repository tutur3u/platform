import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    roleId: string;
  };
}

export async function PUT(req: Request, { params: { roleId: id } }: Params) {
  const supabase = createClient();

  const data = await req.json();

  const { error } = await supabase
    .from('workspace_roles')
    .update(data)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace role' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params: { roleId: id } }: Params) {
  const supabase = createClient();

  const { error } = await supabase
    .from('workspace_roles')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace role' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
