import { createAdminClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(_: Request) {
  const supabase = await createAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { message: 'Error fetching user field types' },
      { status: 500 }
    );
  }

  // const { data, error } = await supabase
  //   .from('field_types')
  //   .select('id')
  //   .eq('enabled', true);

  // if (error) {
  //   console.log(error);
  //   return NextResponse.json(
  //     { message: 'Error fetching user field types' },
  //     { status: 500 }
  //   );
  // }

  // return NextResponse.json(data);
  return NextResponse.json([
    { id: 'TEXT' },
    { id: 'NUMBER' },
    { id: 'BOOLEAN' },
    { id: 'DATE' },
    { id: 'DATETIME' },
  ]);
}
