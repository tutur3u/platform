import {
  assessFeatureFlagMutation,
  httpStatusForMutation,
  validateMutationCommand,
} from '@tuturuuu/feature-flags';
import { connection, NextResponse } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';
import {
  asPrivateRpcAdmin,
  commitPlatformFeatureFlag,
  readPlatformFeatureFlagState,
} from '@/lib/feature-flags/platform-feature-flag-store';

export async function GET(request: Request) {
  await connection();
  const access = await authorizeInfrastructureAdminRequest(
    'view_infrastructure',
    true,
    request
  );
  if (!access.ok) return access.response;
  const read = await readPlatformFeatureFlagState({
    actorId: access.user.id,
    admin: asPrivateRpcAdmin(access.sbAdmin),
  });
  if (read.status === 'denied') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (read.status !== 'ready') {
    return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
  }
  return NextResponse.json({ overrides: read.overrides });
}

export async function POST(request: Request) {
  await connection();
  const access = await authorizeInfrastructureAdminRequest(
    'manage_workspace_roles',
    true,
    request
  );
  if (!access.ok) return access.response;
  // Bearer authentication never falls back to cookies in the admin guard.
  // Cookie mutations require a same-origin browser intent boundary.
  if (request.headers.get('authorization') === null) {
    const origin = request.headers.get('origin');
    const fetchSite = request.headers.get('sec-fetch-site');
    let sameOrigin = false;
    try {
      sameOrigin =
        origin !== null &&
        origin === new URL(origin).origin &&
        origin === new URL(request.url).origin;
    } catch {
      sameOrigin = false;
    }
    if (
      !sameOrigin ||
      request.headers.get('x-tuturuuu-feature-flag-action') !== '1' ||
      (fetchSite !== null && fetchSite !== 'same-origin')
    ) {
      return NextResponse.json(
        { error: 'mutation_forbidden' },
        { status: 403 }
      );
    }
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_operation' }, { status: 400 });
  }
  const decision = assessFeatureFlagMutation({
    authenticated: true,
    body,
    canMutate: true,
    rootMember: true,
    sessionActorId: access.user.id,
  });
  if (decision.kind === 'outcome') {
    return NextResponse.json(decision.outcome, {
      status: httpStatusForMutation(decision.outcome),
    });
  }
  if (decision.kind !== 'command') {
    return NextResponse.json({ error: decision.kind }, { status: 403 });
  }
  const rejected = validateMutationCommand(decision.command, {
    allowActor: () => true,
  });
  if (rejected) {
    return NextResponse.json(rejected, {
      status: httpStatusForMutation(rejected),
    });
  }
  const result = await commitPlatformFeatureFlag({
    admin: asPrivateRpcAdmin(access.sbAdmin),
    command: decision.command,
  });
  if (result.status === 'unknown') {
    return NextResponse.json(
      { operationId: result.operationId, status: 'unknown' },
      { status: 503 }
    );
  }
  return NextResponse.json(result.outcome, {
    status: httpStatusForMutation(result.outcome),
  });
}
