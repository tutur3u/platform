import {
  DELETE as deleteMembers,
  GET as getMembers,
} from '@tuturuuu/apis/members/route';
import { type NextRequest, NextResponse } from 'next/server';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  if (!normalizedWsId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  return getMembers(req, { params: Promise.resolve({ wsId: normalizedWsId }) });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  if (!normalizedWsId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  return deleteMembers(req, {
    params: Promise.resolve({ wsId: normalizedWsId }),
  });
}
