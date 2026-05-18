import { type NextRequest, NextResponse } from 'next/server';
import { runHiveWorkflow } from '@/lib/hive/workflows';
import {
  hiveWorkflowRunPayloadSchema,
  requireHiveAccess,
  withHiveRoute,
} from '../../../../../_shared';

type Params = {
  params: Promise<{
    serverId: string;
    workflowId: string;
  }>;
};

const ROUTE = '/api/v1/hive/servers/[serverId]/workflows/[workflowId]/run';

export async function POST(request: NextRequest, { params }: Params) {
  const { serverId, workflowId } = await params;

  return withHiveRoute(request, ROUTE, async () => {
    const access = await requireHiveAccess(request);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => ({}));
    const parsed = hiveWorkflowRunPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid Hive workflow run payload' },
        { status: 400 }
      );
    }

    const run = await runHiveWorkflow({
      actorUserId: access.access.user.id,
      input: parsed.data.input,
      isAdmin: access.access.isAdmin,
      researchSessionId: parsed.data.researchSessionId,
      serverId,
      workflowId,
    });

    if (!run) {
      return NextResponse.json(
        { error: 'Hive workflow not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ run });
  });
}
