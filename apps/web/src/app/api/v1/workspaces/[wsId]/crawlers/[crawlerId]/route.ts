import { createAdminClient, createClient } from '@tutur3u/supabase/next/server';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    crawlerId: string;
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
  const { wsId, crawlerId } = await params;
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
    .from('workspace_crawlers')
    .update(data)
    .eq('id', crawlerId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace crawler' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const { wsId, crawlerId } = await params;
  const apiKey = (await headers()).get('API_KEY');

  if (apiKey) {
    const isValid = await validateApiKey(wsId, apiKey);
    if (!isValid) {
      return NextResponse.json({ message: 'Invalid API key' }, { status: 401 });
    }
  }

  const supabase = apiKey ? await createAdminClient() : await createClient();

  const { error } = await supabase
    .from('workspace_crawlers')
    .delete()
    .eq('id', crawlerId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace crawler' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
