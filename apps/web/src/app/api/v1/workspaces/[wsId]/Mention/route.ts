import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;
  const { data, error } = await supabase
    .from('workspace_users')
    .select('email')
    .eq('ws_id', wsId);

  if (error) {
    console.log('Error getting users', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const email = data?.map((email) => email.email) || [];

  return NextResponse.json(
    { email },  
    { status: 200 }
  );
  
}
