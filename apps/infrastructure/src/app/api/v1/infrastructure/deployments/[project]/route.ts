import { NextResponse } from 'next/server';
import {
  CoordinatorRequestError,
  isProjectId,
  readDeployProject,
} from '@/lib/infrastructure/deploy-coordinator';
import { authorizeInfrastructureViewer } from '../../monitoring/blue-green/authorization';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ project: string }> }
) {
  const authorization = await authorizeInfrastructureViewer(request);
  if (!authorization.ok) return authorization.response;
  const { project } = await params;
  if (!isProjectId(project))
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  try {
    const result = await readDeployProject(authorization.user.id, project);
    if (!result)
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof CoordinatorRequestError)
      return NextResponse.json(
        { message: error.code },
        { status: error.status >= 500 ? 502 : error.status }
      );
    console.error('Failed to read deployment coordinator project:', error);
    return NextResponse.json(
      { message: 'Failed to read deployments' },
      { status: 500 }
    );
  }
}
