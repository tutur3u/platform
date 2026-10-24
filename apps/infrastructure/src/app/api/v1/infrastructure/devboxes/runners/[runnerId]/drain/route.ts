import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setDevboxRunnerDrain } from '@/lib/devboxes/admin-runner-control';
import { authorizeDevboxRootAdmin } from '@/lib/devboxes/authorization';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';

const DrainSchema = z.object({ draining: z.boolean() }).strict();

// Draining stops new claims, requeues queued Judge work, cancels other queued
// work pinned to the runner and releases its idle leases. The snapshot's
// per-runner `drained` flag reports when in-flight work has finished.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runnerId: string }> }
) {
  const authorization = await authorizeDevboxRootAdmin(request);
  if (!authorization.ok) return authorization.response;

  const runnerId = z.uuid().safeParse((await params).runnerId);
  const body = DrainSchema.safeParse(
    await request.json().catch(() => undefined)
  );
  if (!runnerId.success || !body.success)
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });

  try {
    return NextResponse.json({
      runnerId: runnerId.data,
      ...(await setDevboxRunnerDrain(runnerId.data, body.data.draining)),
    });
  } catch (error) {
    return createDevboxRouteErrorResponse(
      error,
      'Failed to update devbox runner drain'
    );
  }
}
