import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    fieldId: string;
  };
}

export async function PUT(req: Request, { params: { fieldId: id } }: Params) {
  const supabase = createRouteHandlerClient({ cookies });

  const data = await req.json();

  const possible_values = data.possible_values
    ? data.possible_values.filter((value: string) => value !== '')
    : null;

  const newData = {
    ...data,
    possible_values: possible_values?.length ? possible_values : null,
  };

  const { error } = await supabase
    .from('workspace_user_fields')
    .update(newData)
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

export async function DELETE(_: Request, { params: { fieldId: id } }: Params) {
  const supabase = createRouteHandlerClient({ cookies });

  const { error } = await supabase
    .from('workspace_user_fields')
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
