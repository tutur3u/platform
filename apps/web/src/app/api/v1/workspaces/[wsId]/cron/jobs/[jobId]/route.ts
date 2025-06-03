import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    jobId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { jobId } = await params;

  const { data, error } = await supabase
    .from('workspace_cron_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching workspace cron job' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { jobId } = await params;

  const data = await req.json();

  const { error } = await supabase
    .from('workspace_cron_jobs')
    .update(data)
    .eq('id', jobId);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error updating workspace cron job' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { jobId } = await params;

  const { error } = await supabase
    .from('workspace_cron_jobs')
    .delete()
    .eq('id', jobId);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error deleting workspace cron job' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
