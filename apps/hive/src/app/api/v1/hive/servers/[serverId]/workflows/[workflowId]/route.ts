import { type NextRequest, NextResponse } from 'next/server';
import {
  archiveHiveWorkflow,
  getHiveWorkflow,
  updateHiveWorkflow,
  validateHiveWorkflowForPersistence,
} from '@/lib/hive/workflows';
import {
  hiveWorkflowPatchSchema,
  requireHiveAccess,
  requireHiveAdmin,
  withHiveRoute,
} from '../../../../_shared';

type Params = {
  params: Promise<{
    serverId: string;
    workflowId: string;
  }>;
};

const ROUTE = '/api/v1/hive/servers/[serverId]/workflows/[workflowId]';

export async function GET(request: NextRequest, { params }: Params) {
  const { serverId, workflowId } = await params;

  return withHiveRoute(request, ROUTE, async () => {
    const access = await requireHiveAccess(request);
    if (!access.ok) return access.response;

    const workflow = await getHiveWorkflow({
      isAdmin: access.access.isAdmin,
      serverId,
      workflowId,
    });

    if (!workflow) {
      return NextResponse.json(
        { error: 'Hive workflow not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ workflow });
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { serverId, workflowId } = await params;

  return withHiveRoute(request, ROUTE, async () => {
    const access = await requireHiveAdmin(request);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => null);
    const parsed = hiveWorkflowPatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid Hive workflow payload' },
        { status: 400 }
      );
    }

    if (parsed.data.definition) {
      const validation = validateHiveWorkflowForPersistence(
        parsed.data.definition
      );

      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.errors.join(' ') },
          { status: 400 }
        );
      }
    }

    const workflow = await updateHiveWorkflow({
      actorUserId: access.access.user.id,
      definition: parsed.data.definition,
      description: parsed.data.description,
      enabled: parsed.data.enabled,
      name: parsed.data.name,
      serverId,
      workflowId,
    });

    if (!workflow) {
      return NextResponse.json(
        { error: 'Hive workflow not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ workflow });
  });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { serverId, workflowId } = await params;

  return withHiveRoute(request, ROUTE, async () => {
    const access = await requireHiveAdmin(request);
    if (!access.ok) return access.response;

    const workflow = await archiveHiveWorkflow({
      actorUserId: access.access.user.id,
      serverId,
      workflowId,
    });

    if (!workflow) {
      return NextResponse.json(
        { error: 'Hive workflow not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  });
}
