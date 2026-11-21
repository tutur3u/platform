import { type NextRequest, NextResponse } from 'next/server';
import { rotateExternalAppSecret } from '@/lib/app-coordination/external-apps';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import { requireExternalAppRegistryAdmin } from '../../access';

interface Params {
  params: Promise<{
    appId: string;
  }>;
}

async function rotateSecret(request: NextRequest, { params }: Params) {
  const access = await requireExternalAppRegistryAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const { appId } = await params;

  try {
    const result = await rotateExternalAppSecret({
      actorUserId: access.user.id,
      appId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.warn('Failed to rotate external app secret', {
      appId,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: 'Failed to rotate external app secret' },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/infrastructure/external-apps/[appId]/secrets',
    },
    () => rotateSecret(request, context)
  );
}
