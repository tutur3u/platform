import { NextResponse } from 'next/server';
import { getWorkspaceSecretsAccess } from '../access';

interface Params {
  params: Promise<{
    wsId: string;
    secretId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const data = await req.json();
  const { wsId, secretId } = await params;
  const access = await getWorkspaceSecretsAccess(wsId);

  if (!access.allowed) {
    return NextResponse.json(
      { message: access.message },
      { status: access.status }
    );
  }

  const { error } = await access.db
    .from('workspace_secrets')
    .update(data)
    .eq('id', secretId)
    .eq('ws_id', access.resolvedWsId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const { wsId, secretId } = await params;
  const access = await getWorkspaceSecretsAccess(wsId);

  if (!access.allowed) {
    return NextResponse.json(
      { message: access.message },
      { status: access.status }
    );
  }

  const { error } = await access.db
    .from('workspace_secrets')
    .delete()
    .eq('id', secretId)
    .eq('ws_id', access.resolvedWsId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
