import { NextResponse } from 'next/server';
import {
  CoordinatorRequestError,
  createCoordinatorClient,
  isDeployEnvironment,
  isProjectId,
  parseDeployAction,
  readCoordinatorConfig,
} from '@/lib/infrastructure/deploy-coordinator';
import { authorizeInfrastructureOperator } from '../../../monitoring/blue-green/authorization';

// Operator actions: promote, rollback, cancel, resolve, hold release and the
// environment stop fence. Every one requires the root-workspace operator
// permission and is recorded by the coordinator under the signed-in user.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ project: string; environment: string }> }
) {
  const authorization = await authorizeInfrastructureOperator(request);
  if (!authorization.ok) return authorization.response;
  const { project, environment } = await params;
  if (!isProjectId(project) || !isDeployEnvironment(environment))
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const config = readCoordinatorConfig();
  if (!config)
    return NextResponse.json(
      { message: 'COORDINATOR_UNCONFIGURED' },
      { status: 503 }
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: 'Expected a JSON request body.' },
      { status: 400 }
    );
  }
  const action = parseDeployAction(environment, body);
  if (!action)
    return NextResponse.json({ message: 'INVALID_INPUT' }, { status: 400 });
  try {
    await createCoordinatorClient(config, authorization.user.id).run(
      project,
      environment,
      action
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CoordinatorRequestError)
      return NextResponse.json(
        { message: error.code },
        { status: error.status >= 500 ? 502 : error.status }
      );
    console.error('Failed to run deployment coordinator action:', error);
    return NextResponse.json(
      { message: 'Failed to run the deployment action' },
      { status: 500 }
    );
  }
}
