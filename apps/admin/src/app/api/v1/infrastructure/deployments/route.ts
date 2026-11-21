import { NextResponse } from 'next/server';
import {
  CoordinatorRequestError,
  readDeployProjects,
} from '@/lib/infrastructure/deploy-coordinator';
import { authorizeInfrastructureViewer } from '../monitoring/blue-green/authorization';

export async function GET(request: Request) {
  const authorization = await authorizeInfrastructureViewer(request);
  if (!authorization.ok) return authorization.response;
  try {
    return NextResponse.json(await readDeployProjects(authorization.user.id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof CoordinatorRequestError)
      return NextResponse.json(
        { message: error.code },
        { status: error.status >= 500 ? 502 : error.status }
      );
    console.error('Failed to read deployment coordinator projects:', error);
    return NextResponse.json(
      { message: 'Failed to read deployments' },
      { status: 500 }
    );
  }
}
