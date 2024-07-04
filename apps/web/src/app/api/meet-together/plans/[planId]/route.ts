import { createAdminClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    planId: string;
  };
}

export async function PUT(req: Request, { params: { planId: id } }: Params) {
  const sbAdmin = createAdminClient();

  const data = await req.json();
  const name = data.name;

  const { error } = await sbAdmin
    .from('meet_together_plans')
    .update({ name })
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating meet together plan' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params: { planId: id } }: Params) {
  const sbAdmin = createAdminClient();

  const { error } = await sbAdmin
    .from('meet_together_plans')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting meet together plan' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
