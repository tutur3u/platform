import { type NextRequest, NextResponse } from 'next/server';
import {
  createHiveWorkflow,
  listHiveWorkflows,
  validateHiveWorkflowForPersistence,
} from '@/lib/hive/workflows';
import {
  hiveWorkflowPayloadSchema,
  requireHiveAccess,
  requireHiveAdmin,
  withHiveRoute,
} from '../../../_shared';

type Params = {
  params: Promise<{ serverId: string }>;
};

const ROUTE = '/api/v1/hive/servers/[serverId]/workflows';

export async function GET(request: NextRequest, { params }: Params) {
  const { serverId } = await params;

  return withHiveRoute(request, ROUTE, async () => {
    const access = await requireHiveAccess(request);
    if (!access.ok) return access.response;

    const workflows = await listHiveWorkflows({
      isAdmin: access.access.isAdmin,
      serverId,
    });

    return NextResponse.json({ workflows });
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { serverId } = await params;

  return withHiveRoute(request, ROUTE, async () => {
    const access = await requireHiveAdmin(request);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => null);
    const parsed = hiveWorkflowPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid Hive workflow payload' },
        { status: 400 }
      );
    }

    const validation = validateHiveWorkflowForPersistence(
      parsed.data.definition
    );

    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.errors.join(' ') },
        { status: 400 }
      );
    }

    const workflow = await createHiveWorkflow({
      actorUserId: access.access.user.id,
      definition: parsed.data.definition,
      description: parsed.data.description ?? null,
      enabled: parsed.data.enabled,
      name: parsed.data.name,
      serverId,
    });

    if (!workflow) {
      return NextResponse.json(
        { error: 'Failed to create Hive workflow' },
        { status: 400 }
      );
    }

    return NextResponse.json({ workflow }, { status: 201 });
  });
}
