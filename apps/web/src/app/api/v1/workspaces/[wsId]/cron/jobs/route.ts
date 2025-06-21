import { createClient } from '@ncthub/supabase/next/server';
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
    .from('workspace_cron_jobs')
    .select('*')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching workspace cron jobs' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  const data = await req.json();

  const { error } = await supabase.from('workspace_cron_jobs').insert({
    ...data,
    ws_id: wsId,
  });

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error creating workspace cron job' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
