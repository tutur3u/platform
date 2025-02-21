import { createClient } from '@tutur3u/supabase/next/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const data = await req.json();

  const { error } = await supabase.from('user_group_post_checks').insert(data);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error inserting data into user_group_post_checks' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Data inserted successfully' });
}
