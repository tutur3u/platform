import { parseRuleListQuery, parseRuleWrite } from '@tuturuuu/feature-flags';
import { connection, NextResponse } from 'next/server';
import {
  asPrivateRpcAdmin,
  readRules,
  runtimeDefinitionFor,
  writeRule,
} from '@/lib/feature-flags/rule-store';
import { hasFeatureFlagWriteIntent } from '@/lib/feature-flags/write-intent';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

export async function GET(request: Request) {
  await connection();
  const access = await authorizeInfrastructureAdminRequest(
    ['view_infrastructure', 'manage_feature_flags'],
    true,
    request
  );
  if (!access.ok) return access.response;
  const query = parseRuleListQuery(new URL(request.url).searchParams);
  if (!query) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }
  const result = await readRules({
    actorId: access.user.id,
    admin: asPrivateRpcAdmin(access.sbAdmin),
    query,
  });
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: Request) {
  await connection();
  const access = await authorizeInfrastructureAdminRequest(
    'manage_feature_flags',
    true,
    request
  );
  if (!access.ok) return access.response;
  if (!hasFeatureFlagWriteIntent(request)) {
    return NextResponse.json({ error: 'mutation_forbidden' }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const parsed = parseRuleWrite(body, {
    actorId: access.user.id,
    // A bearer token is the CLI; a cookie session is the admin screen.
    client: request.headers.has('authorization') ? 'ttr' : 'admin-ui',
    definitionFor: runtimeDefinitionFor,
  });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status }
    );
  }
  const result = await writeRule({
    admin: asPrivateRpcAdmin(access.sbAdmin),
    command: parsed.command,
  });
  return NextResponse.json(result.body, { status: result.status });
}
