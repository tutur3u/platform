import { z } from 'zod';
import {
  listExternalApps,
  rotateExternalAppSecret,
  upsertExternalApp,
} from '@/lib/app-coordination/external-apps';
import { requireExternalControlPlaneAccess } from '@/lib/external-projects/root-access';

const headers = { 'Cache-Control': 'no-store' };
const id = z.string().regex(/^[a-z0-9_-]{1,64}$/u);
const payloadSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rotate-secret'), id }).strict(),
  z
    .object({
      action: z.literal('save'),
      id,
      displayName: z.string().trim().min(1).max(120),
      enabled: z.boolean(),
      origins: z.array(z.url().max(512)).min(1).max(20),
      allowedScopes: z.array(z.string().trim().min(1).max(80)).max(50),
      allowedWorkspaceIds: z.array(z.uuid()).min(1).max(50),
    })
    .strict(),
]);

async function authorize(request: Request) {
  const access = await requireExternalControlPlaneAccess(request, 'apps');
  if (!access.ok) {
    access.response.headers.set('Cache-Control', 'no-store');
    return { response: access.response };
  }
  return { user: access.user };
}

export async function GET(request: Request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  try {
    return Response.json({ apps: await listExternalApps() }, { headers });
  } catch {
    return Response.json(
      { error: 'External apps could not be loaded' },
      { status: 500, headers }
    );
  }
}

export async function POST(request: Request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  const parsed = payloadSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success)
    return Response.json(
      { error: 'Invalid external app configuration' },
      { status: 400, headers }
    );
  try {
    const result =
      parsed.data.action === 'rotate-secret'
        ? await rotateExternalAppSecret({
            actorUserId: access.user.id,
            appId: parsed.data.id,
          })
        : await upsertExternalApp({
            actorUserId: access.user.id,
            payload: parsed.data,
          });
    return Response.json(result, { headers });
  } catch {
    return Response.json(
      { error: 'External app configuration was not saved' },
      { status: 400, headers }
    );
  }
}
