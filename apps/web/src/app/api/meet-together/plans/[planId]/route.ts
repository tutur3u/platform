import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    planId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const sbAdmin = await createAdminClient();
  const { planId: id } = await params;

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

export async function DELETE(_: Request, { params }: Params) {
  const sbAdmin = await createAdminClient();
  const { planId: id } = await params;

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
