import { NextResponse } from 'next/server';
import {
  createRouteErrorResponse,
  listExternalProjectTeamMembers,
  requireExternalProjectTeamAccess,
} from '@/lib/external-projects/team-access';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await requireExternalProjectTeamAccess({ request, wsId });

  if (!access.ok) {
    return access.response;
  }

  try {
    const members = await listExternalProjectTeamMembers({
      access,
      status: new URL(request.url).searchParams.get('status'),
    });

    return NextResponse.json(members);
  } catch (error) {
    return createRouteErrorResponse('Error loading CMS team members', error);
  }
}
