import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    documentId: string;
  }>;
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();

  const { documentId } = await params;

  const { error } = await supabase
    .from('workspace_documents')
    .delete()
    .eq('id', documentId);

  if (error) {
    console.error('Error deleting document:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(
    { message: 'Document deleted successfully' },
    { status: 200 }
  );
}
