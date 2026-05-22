import { appCoordinationSessionPolicySchema } from '@tuturuuu/auth/app-session-policy';
import { type NextRequest, NextResponse } from 'next/server';
import {
  getAppCoordinationSessionPolicy,
  saveAppCoordinationSessionPolicy,
} from '@/lib/app-coordination/session-policy';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';
import { requireExternalAppRegistryAdmin } from '../external-apps/access';

async function readPolicy(request: NextRequest) {
  const access = await requireExternalAppRegistryAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  try {
    return NextResponse.json(
      await getAppCoordinationSessionPolicy({
        bypassCache: true,
        db: access.sbAdmin,
      })
    );
  } catch (error) {
    serverLogger.error('Failed to read app coordination session policy', error);
    return NextResponse.json(
      { error: 'Failed to read app coordination policy' },
      { status: 500 }
    );
  }
}

async function updatePolicy(request: NextRequest) {
  const access = await requireExternalAppRegistryAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = appCoordinationSessionPolicySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        details: parsed.error.flatten(),
        error: 'Invalid app coordination policy',
      },
      { status: 400 }
    );
  }

  try {
    const policy = await saveAppCoordinationSessionPolicy({
      db: access.sbAdmin,
      policy: parsed.data,
    });

    return NextResponse.json({
      policy,
      source: 'secret',
    });
  } catch (error) {
    serverLogger.error('Failed to save app coordination session policy', error);
    return NextResponse.json(
      { error: 'Failed to save app coordination policy' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/infrastructure/app-coordination',
    },
    () => readPolicy(request)
  );
}

export async function PUT(request: NextRequest) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/infrastructure/app-coordination',
    },
    () => updatePolicy(request)
  );
}
