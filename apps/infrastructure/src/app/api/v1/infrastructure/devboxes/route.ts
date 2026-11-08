import { NextResponse } from 'next/server';
import { listDevboxControlSnapshot } from '@/lib/devboxes/admin-store';
import { authorizeDevboxRootViewer } from '@/lib/devboxes/authorization';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';

export async function GET(request: Request) {
  const authorization = await authorizeDevboxRootViewer(request);
  if (!authorization.ok) return authorization.response;

  try {
    return NextResponse.json(await listDevboxControlSnapshot());
  } catch (error) {
    return createDevboxRouteErrorResponse(
      error,
      'Failed to load devbox control snapshot'
    );
  }
}
