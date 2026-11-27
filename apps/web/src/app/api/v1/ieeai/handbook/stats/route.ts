import { createHmac, randomBytes } from 'node:crypto';
import { verifyCliAccessToken } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  handbookRange,
  handbookTimezone,
  readHandbookRows,
} from '@tuturuuu/utils/ieeai-handbook-stats';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { connection } from 'next/server';
import { normalizeWorkspaceMembers } from '@/lib/external-apps/workspace-members-model';
import { getWorkspaceMembers } from '@/lib/workspace-members';

const workspaceId = 'a65cebd7-3a8c-4883-a3d9-82f9703d652f';
const workerPath = '/admin/api/internal/handbook/stats';

function reply(payload: object, status: number) {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function isEntitled(userId: string) {
  const admin = await createAdminClient({ noCookie: true });
  const membership = await verifyWorkspaceMembershipType({
    supabase: admin,
    requiredType: 'MEMBER',
    wsId: workspaceId,
    userId,
  });
  if (!membership.ok) return false;

  const members = await getWorkspaceMembers({
    supabase: admin,
    sbAdmin: admin,
    wsId: workspaceId,
    status: 'joined',
  });
  const snapshot = normalizeWorkspaceMembers({
    currentUserId: userId,
    members: members.filter(
      (member) =>
        member.id === userId &&
        member.pending === false &&
        member.workspace_member_type === 'MEMBER'
    ),
  });
  return snapshot.members.some(
    (member) =>
      member.id === userId &&
      member.role === 'admin' &&
      member.roleSources.some(
        (source) => source === 'creator' || source === 'role'
      )
  );
}

export async function GET(request: Request) {
  await connection();
  if (request.method !== 'GET') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'GET', 'Cache-Control': 'no-store' },
    });
  }
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer (\S+)$/iu)?.[1];
  let userId: string;
  try {
    if (!token?.startsWith('ttr_app_'))
      return reply({ error: 'Unauthorized' }, 401);
    const auth = verifyCliAccessToken(token);
    if (!auth.ok || auth.claims.origin_app !== 'cli' || !auth.claims.sub)
      return reply({ error: 'Unauthorized' }, 401);
    if (auth.claims.workspace_id && auth.claims.workspace_id !== workspaceId) {
      return reply({ error: 'Forbidden' }, 403);
    }
    userId = auth.claims.sub;
  } catch {
    return reply({ error: 'Unauthorized' }, 401);
  }

  const { searchParams } = new URL(request.url);
  const range = handbookRange(searchParams.get('from'), searchParams.get('to'));
  if (!range || [...searchParams].length !== 2) {
    return reply({ error: 'Invalid handbook date range' }, 400);
  }

  try {
    if (!(await isEntitled(userId))) return reply({ error: 'Forbidden' }, 403);
  } catch {
    return reply({ error: 'Forbidden' }, 403);
  }

  try {
    const encoded = process.env.IEEAI_CLI_STATS_HANDOFF_KEY;
    if (!encoded || !/^[\w-]{43}=?$/u.test(encoded)) {
      throw new Error('Invalid handoff key.');
    }
    const key = Buffer.from(encoded, 'base64url');
    if (
      key.length !== 32 ||
      key.toString('base64url') !== encoded.replace(/=$/u, '')
    ) {
      throw new Error('Invalid handoff key.');
    }

    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(16).toString('base64url');
    const canonical = [
      'ieeai-cli-stats-v1',
      'tuturuuu',
      'ieeai-admin',
      'GET',
      workerPath,
      range.query,
      ts,
      nonce,
    ].join('\n');
    const signature = createHmac('sha256', key)
      .update(canonical)
      .digest('base64url');
    const upstream = await fetch(
      `https://ieeai.net${workerPath}?${range.query}`,
      {
        method: 'GET',
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
        headers: {
          'x-ieeai-cli-ts': ts,
          'x-ieeai-cli-nonce': nonce,
          'x-ieeai-cli-signature': signature,
        },
      }
    );
    const rows = await readHandbookRows(upstream, range);
    return reply(
      { from: range.from, to: range.to, timezone: handbookTimezone, rows },
      200
    );
  } catch {
    return reply({ error: 'Handbook stats unavailable' }, 502);
  }
}
