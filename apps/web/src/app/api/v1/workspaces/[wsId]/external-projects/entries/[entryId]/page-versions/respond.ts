import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  requireWorkspaceExternalProjectAccess,
  type WorkspaceExternalProjectMode,
} from '@/lib/external-projects/access';
import { PageVersionError } from '@/lib/external-projects/page-versions';

export type PageVersionParams = {
  params: Promise<{ entryId: string; versionId?: string; wsId: string }>;
};

type Access = Extract<
  Awaited<ReturnType<typeof requireWorkspaceExternalProjectAccess>>,
  { ok: true }
>;

const ids = z.object({
  entryId: z.uuid(),
  versionId: z.uuid().optional(),
  wsId: z.string().min(1),
});

// Shared access check and error mapping for the page-version routes.
export async function handlePageVersionRequest(
  request: Request,
  { params }: PageVersionParams,
  mode: WorkspaceExternalProjectMode,
  run: (
    access: Access,
    scope: { entryId: string; versionId?: string; workspaceId: string }
  ) => Promise<unknown>,
  status = 200
) {
  const parsed = ids.safeParse(await params);
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const access = await requireWorkspaceExternalProjectAccess({
      mode,
      request,
      wsId: parsed.data.wsId,
    });
    if (!access.ok) return access.response;

    const body = await run(access, {
      entryId: parsed.data.entryId,
      versionId: parsed.data.versionId,
      workspaceId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(body, { status });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    if (error instanceof PageVersionError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    console.error('Failed to handle CMS page version request', error);
    return NextResponse.json(
      { error: 'Failed to handle page version request' },
      { status: 500 }
    );
  }
}
