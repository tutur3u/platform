import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';

export async function GET(_: Request) {
  await connection();

  const sbAdmin = await createAdminClient();

  if (!sbAdmin) {
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
