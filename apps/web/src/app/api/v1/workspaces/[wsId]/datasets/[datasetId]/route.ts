import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    datasetId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();

  const data = await req.json();
  const { datasetId: id } = await params;

  const { error } = await supabase
    .from('workspace_datasets')
    .update(data)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace dataset' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { datasetId: id } = await params;

  const { error } = await supabase
    .from('workspace_datasets')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace dataset' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
