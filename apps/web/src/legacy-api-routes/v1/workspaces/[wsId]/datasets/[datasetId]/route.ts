import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { validateWorkspaceApiKey } from '@/lib/workspace-api-key';

interface Params {
  params: Promise<{
    wsId: string;
    datasetId: string;
  }>;
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { wsId, datasetId } = await params;
  const apiKey = (await headers()).get('API_KEY');

  if (apiKey) {
    const isValid = await validateWorkspaceApiKey(wsId, apiKey);
    if (!isValid) {
      return NextResponse.json({ message: 'Invalid API key' }, { status: 401 });
    }
  }

  const supabase = apiKey ? await createAdminClient() : await createClient();
  const data = await req.json();

  const { error } = await supabase
    .from('workspace_datasets')
    .update(data)
    .eq('id', datasetId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace dataset' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const { wsId, datasetId } = await params;
  const apiKey = (await headers()).get('API_KEY');

  if (apiKey) {
    const isValid = await validateWorkspaceApiKey(wsId, apiKey);
    if (!isValid) {
      return NextResponse.json({ message: 'Invalid API key' }, { status: 401 });
    }
  }

  const supabase = apiKey ? await createAdminClient() : await createClient();

  const { error } = await supabase
    .from('workspace_datasets')
    .delete()
    .eq('id', datasetId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace dataset' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
