import { type NextRequest, NextResponse } from 'next/server';
import { getHiveWorkflow, getHiveWorkflowRun } from '@/lib/hive/workflows';
import { requireHiveAccess, withHiveRoute } from '../../../../../../_shared';

type Params = {
  params: Promise<{
    runId: string;
    serverId: string;
    workflowId: string;
  }>;
};

const ROUTE =
  '/api/v1/hive/servers/[serverId]/workflows/[workflowId]/runs/[runId]';

export async function GET(request: NextRequest, { params }: Params) {
  const { runId, serverId, workflowId } = await params;

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

    const run = await getHiveWorkflowRun({ runId, serverId, workflowId });

    if (!run) {
      return NextResponse.json(
        { error: 'Hive workflow run not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ run });
  });
}
