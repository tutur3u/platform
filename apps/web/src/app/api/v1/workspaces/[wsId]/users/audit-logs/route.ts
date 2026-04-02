import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listAuditLogEventsForRange } from '@/app/[locale]/(dashboard)/[wsId]/users/database/audit-log-data';

const SearchParamsSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
  eventKind: z.string().optional(),
  source: z.string().optional(),
  affectedUserQuery: z.string().optional(),
  actorQuery: z.string().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;
  const parsedParams = SearchParamsSchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams.entries())
  );

  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid audit log query parameters' },
      { status: 400 }
    );
  }

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!permissions.containsPermission('manage_workspace_audit_logs')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  try {
    const data = await listAuditLogEventsForRange({
      wsId,
      ...parsedParams.data,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching workspace user audit logs:', error);

    return NextResponse.json(
      { message: 'Error fetching audit logs' },
      { status: 500 }
    );
  }
}
