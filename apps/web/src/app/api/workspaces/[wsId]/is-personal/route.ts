import { isPersonalWorkspace } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export async function GET({ params }: { params: { wsId: string } }) {
  const { wsId } = params;
  const isPersonal = isPersonalWorkspace(wsId);
  return NextResponse.json({ isPersonal: isPersonal });
}
