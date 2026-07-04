import { NextResponse } from 'next/server';
import {
  getExternalProjectTeamContext,
  requireExternalProjectTeamAccess,
} from '@/lib/external-projects/team-access';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireExternalProjectTeamAccess({ request, wsId });

  if (!access.ok) {
    return access.response;
  }

  return NextResponse.json(getExternalProjectTeamContext(access));
}
