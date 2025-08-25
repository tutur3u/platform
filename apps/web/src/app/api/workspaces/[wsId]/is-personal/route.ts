import { isPersonalWorkspace } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
    params: Promise<{
      wsId: string;
    }>;
  }

export async function GET(_: Request, { params }: Params
) {
  const { wsId } = await params;
  const isPersonal = await isPersonalWorkspace(wsId);
  return NextResponse.json({ isPersonal: isPersonal });
}
