import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import {
  getWorkspaceConfig,
  normalizeWorkspaceId,
} from '@/lib/workspace-helper';

interface Params {
  params: Promise<{
    wsId: string;
    configId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: rawWsId, configId: id } = await params;

  // Normalize workspace ID to UUID (handles 'personal', 'internal', etc.)
  const wsId = await normalizeWorkspaceId(rawWsId);

  const { value } = await req.json();

  const { error } = await supabase
    .from('workspace_configs')
    .upsert({
      id,
      ws_id: wsId,
      value: value || '',
      updated_at: new Date().toISOString(),
    })
    .eq('ws_id', wsId)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error upserting workspace config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function GET(_: Request, { params }: Params) {
  const { wsId: rawWsId, configId: id } = await params;

  // Normalize workspace ID to UUID (handles 'personal', 'internal', etc.)
  const wsId = await normalizeWorkspaceId(rawWsId);
  const value = await getWorkspaceConfig(wsId, id);

  if (value === null) {
    return NextResponse.json({}, { status: 404 });
  }

  return NextResponse.json({ value });
}
