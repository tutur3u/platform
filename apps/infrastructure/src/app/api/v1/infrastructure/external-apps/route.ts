import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  listExternalApps,
  upsertExternalApp,
} from '@/lib/app-coordination/external-apps';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';
import { requireExternalAppRegistryAdmin } from './access';

const externalAppSchema = z.object({
  allowedScopes: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  allowedWorkspaceIds: z
    .array(z.string().trim().min(1).max(128))
    .max(50)
    .optional(),
  displayName: z.string().trim().min(1).max(120),
  enabled: z.boolean().default(true),
  id: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{1,64}$/u),
  issueSecret: z.boolean().optional(),
  origins: z.array(z.string().trim().min(1).max(512)).min(1).max(20),
});

async function listApps(request: NextRequest) {
  const access = await requireExternalAppRegistryAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  try {
    return NextResponse.json({
      apps: await listExternalApps(access.sbAdmin),
    });
  } catch (error) {
    serverLogger.error('Failed to list external app registry', error);
    return NextResponse.json(
      { error: 'Failed to list external apps' },
      { status: 500 }
    );
  }
}

async function saveApp(request: NextRequest) {
  const access = await requireExternalAppRegistryAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = externalAppSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid external app payload' },
      { status: 400 }
    );
  }

  try {
    const result = await upsertExternalApp({
      actorUserId: access.user.id,
      payload: parsed.data,
    });

    return NextResponse.json(result);
  } catch (error) {
    serverLogger.warn('Failed to save external app registration', {
      error: error instanceof Error ? error.message : String(error),
      id: parsed.data.id,
    });

    return NextResponse.json(
      { error: 'Failed to save external app' },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/infrastructure/external-apps',
    },
    () => listApps(request)
  );
}

export async function POST(request: NextRequest) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/infrastructure/external-apps',
    },
    () => saveApp(request)
  );
}
