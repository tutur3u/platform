import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setDevboxRunnerFeature } from '@/lib/devboxes/admin-store';
import { authorizeDevboxRootAdmin } from '@/lib/devboxes/authorization';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';

const FeatureSchema = z
  .object({
    feature: z.enum(['run', 'build', 'serve', 'tunnel', 'judge', 'playground']),
    enabled: z.boolean(),
  })
  .strict();

// Same guarded RPC as the dashboard: Judge/playground and trusted workloads
// cannot share a runner, and Judge/playground require a fresh ready report.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runnerId: string }> }
) {
  const authorization = await authorizeDevboxRootAdmin(request);
  if (!authorization.ok) return authorization.response;

  const runnerId = z.uuid().safeParse((await params).runnerId);
  const body = FeatureSchema.safeParse(
    await request.json().catch(() => undefined)
  );
  if (!runnerId.success || !body.success)
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });

  try {
    await setDevboxRunnerFeature(
      runnerId.data,
      body.data.feature,
      body.data.enabled
    );
    return NextResponse.json({
      runnerId: runnerId.data,
      feature: body.data.feature,
      enabled: body.data.enabled,
    });
  } catch (error) {
    return createDevboxRouteErrorResponse(
      error,
      'Failed to update devbox runner feature'
    );
  }
}
