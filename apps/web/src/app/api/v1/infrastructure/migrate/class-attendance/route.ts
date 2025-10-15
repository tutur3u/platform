import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function PUT(req: Request) {
  const supabase = await createClient();

  const json = await req.json();

  const { error } = await supabase
    .from('user_group_attendance')
    .upsert(json?.data || [], {
      onConflict: 'group_id,user_id,date',
      ignoreDuplicates: false,
    });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error migrating class attendance' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
