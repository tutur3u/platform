import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('transaction_tags')
    .select('*')
    .order('name');

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching tags' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
