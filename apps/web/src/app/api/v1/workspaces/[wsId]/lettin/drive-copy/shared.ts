import { verifyAppSessionRequest } from '@tuturuuu/auth/app-session';
import { WorkspaceStorageError } from '@tuturuuu/storage-core/workspace-storage-provider';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveWorkspaceStorageRouteAuth } from '@/legacy-api-routes/v1/workspaces/[wsId]/storage/route-auth';

export const copyByteLimit = 10 * 1024 * 1024;
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const copyFilename = z
  .string()
  .regex(new RegExp(`^lettin-notebook-${uuid}\\.json$`, 'u'));
export const copyPath = z
  .string()
  .regex(new RegExp(`^Lettin/lettin-notebook-${uuid}\\.json$`, 'u'));
export const uploadInput = z
  .object({
    expectedActor: z.guid(),
    filename: copyFilename,
    path: z.literal('Lettin'),
    upsert: z.literal(false),
    contentType: z.literal('application/json'),
    size: z.number().int().min(1).max(copyByteLimit),
  })
  .strict();
export const finalizeInput = z
  .object({
    expectedActor: z.guid(),
    path: copyPath,
    originalFilename: copyFilename,
    contentType: z.literal('application/json'),
    provider: z.enum(['r2', 'supabase']),
  })
  .strict();

export async function authorizeCopy(request: Request, wsId: string) {
  if (!verifyAppSessionRequest(request, { targetApp: 'lettin' }).ok) {
    return { ok: false as const, response: invalidCopy(401) };
  }
  const auth = await resolveWorkspaceStorageRouteAuth(request, wsId, {
    appSessionTargets: 'lettin',
  });
  if (!auth.ok) return auth;
  if (auth.context.permissions.withoutPermission('manage_drive')) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    };
  }
  return auth;
}
export function copyError(error: unknown) {
  console.error(
    'Lettin Drive copy failed',
    error instanceof WorkspaceStorageError ? error.status : 'unconfirmed'
  );
  return NextResponse.json(
    { message: 'Copy could not be confirmed' },
    {
      status: error instanceof WorkspaceStorageError ? error.status : 500,
    }
  );
}
export function invalidCopy(status = 400) {
  return NextResponse.json({ message: 'Invalid copy request' }, { status });
}
