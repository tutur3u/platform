import { NextResponse } from 'next/server';
import { getWorkspaceSecretsAccess } from './access';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await getWorkspaceSecretsAccess(wsId, request);

  if (!access.allowed) {
    return NextResponse.json(
      { message: access.message },
      { status: access.status }
    );
  }

  const { data, error } = await access.db
    .from('workspace_secrets')
    .select('*')
    .eq('ws_id', access.resolvedWsId)
    .order('name', { ascending: true });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace API configs' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const data = await req.json();
  const { wsId } = await params;
  const access = await getWorkspaceSecretsAccess(wsId, req);

  if (!access.allowed) {
    return NextResponse.json(
      { message: access.message },
      { status: access.status }
    );
  }

  const { error } = await access.db.from('workspace_secrets').insert({
    ...data,
    ws_id: access.resolvedWsId,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
