import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    datasetId: string;
  }>;
}

async function validateApiKey(wsId: string, apiKey: string) {
  const sbAdmin = await createAdminClient();
  const { error } = await sbAdmin
    .from('workspace_api_keys')
    .select('id')
    .eq('ws_id', wsId)
    .eq('value', apiKey)
    .single();

  return !error;
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { wsId, datasetId } = await params;
  const apiKey = (await headers()).get('API_KEY');

  if (apiKey) {
    const isValid = await validateApiKey(wsId, apiKey);
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
    const isValid = await validateApiKey(wsId, apiKey);
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
