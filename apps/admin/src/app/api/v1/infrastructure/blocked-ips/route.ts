import { isAbuseGuardFamilyAssigned } from '@tuturuuu/utils/abuse-guard/select';
import type { Tables } from '@tuturuuu/types/supabase';
import { BLOCK_DURATIONS, REDIS_KEYS } from '@tuturuuu/utils/abuse-protection';
import { isCloudflareIp } from '@tuturuuu/utils/abuse-protection/abuse-subject';
import {
  extractIPFromRequest,
  readEdgeAbuseProtectionControls,
} from '@tuturuuu/utils/abuse-protection/edge';
import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  allBlockStores,
  blockReasons,
  getBlockStores,
  ipLiteral,
  listIpBlocks,
  readEdgeBlock,
} from '@/lib/infrastructure/ip-block-store';
import { authorizeIpOperator } from '@/lib/infrastructure/ip-operator';

const maxTtl = 30 * 24 * 3600;
const blockReason = z.enum(blockReasons);
const reason = z.string().trim().min(1).max(MAX_SEARCH_LENGTH);
const input = z.object({
  ip_address: ipLiteral,
  reason,
  notes: reason.optional(),
  block_level: z
    .union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
    ])
    .default(1),
  ttl: z.number().int().min(1).max(maxTtl).optional(),
});

const query = z.object({
  status: z
    .enum(['all', 'active', 'expired', 'manually_unblocked'])
    .default('active'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  ip: ipLiteral.optional(),
  q: z.string().max(MAX_SEARCH_LENGTH).optional(),
  mode: z.enum(['list', 'inspect', 'whoami', 'ratelimit']).default('list'),
});

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function GET(req: Request) {
  await connection();
  const auth = await authorizeIpOperator(req);
  if (!auth.ok) return auth.response;
  const parsed = query.safeParse(
    Object.fromEntries(new URL(req.url).searchParams)
  );
  if (!parsed.success) return reply({ message: 'Invalid block query' }, 400);

  try {
    const { mode, ip, q, page, pageSize, status } = parsed.data;
    if (mode === 'ratelimit') {
      return reply({
        controls: await readEdgeAbuseProtectionControls({ allowCache: false }),
        blockDurationsSeconds: BLOCK_DURATIONS,
      });
    }
    const address = mode === 'whoami' ? extractIPFromRequest(req.headers) : ip;
    if (
      (mode === 'inspect' || mode === 'whoami') &&
      !ipLiteral.safeParse(address).success
    )
      return reply({ message: 'A valid IP address is required' }, 400);
    const listing = await listIpBlocks(auth.sbAdmin, {
      ip: address,
      q: mode === 'list' ? q : undefined,
      page,
      pageSize,
      status: status === 'all' ? undefined : status,
    });
    if (mode === 'whoami')
      return reply({
        ip: address,
        blocked: listing.count > 0,
        edgeComplete: listing.edgeComplete,
      });

    if (mode === 'inspect') {
      if (!listing.count && !listing.edgeComplete)
        return reply({ message: 'Complete block state unavailable' }, 503);
      if (!listing.count)
        return reply(
          { message: 'IP block not found', edgeComplete: listing.edgeComplete },
          404
        );
      const { data, count, error } = await auth.sbAdmin
        .from('abuse_events')
        .select('event_type, endpoint, created_at', { count: 'exact' })
        .eq('ip_address', address ?? '')
        .neq('event_type', 'manual')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error('Events unavailable');
      const routes = new Map<string, number>();
      for (const event of data) {
        const path = event.endpoint?.split(/[?#]/u, 1)[0];
        if (path?.startsWith('/') && !path.startsWith('//'))
          routes.set(path, (routes.get(path) ?? 0) + 1);
      }
      return reply({
        ip: address,
        blocks: listing.data.map(({ metadata: _metadata, ...block }) => block),
        eventCount: count,
        sampledEvents: data.length,
        routes: [...routes].map(([route, count]) => ({ route, count })),
        edgeComplete: listing.edgeComplete,
      });
    }

    return reply({
      ...listing,
      ...(req.headers.has('authorization')
        ? {
            data: listing.data.map(
              ({ metadata: _metadata, ...block }) => block
            ),
          }
        : {}),
      page,
      pageSize,
      totalPages: Math.ceil(listing.count / pageSize),
    });
  } catch {
    return reply({ message: 'Block state unavailable' }, 503);
  }
}

async function readMutation(req: Request) {
  if (
    req.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !==
    'application/json'
  )
    return null;
  const reader = req.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 4096) {
        void reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    const parsed = input.safeParse(JSON.parse(text + decoder.decode()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function mutate(req: Request, operation: 'block' | 'unblock') {
  const auth = await authorizeIpOperator(req, true);
  if (!auth.ok) return auth.response;
  const payload = await readMutation(req);
  if (!payload || (operation === 'block' && isCloudflareIp(payload.ip_address)))
    return reply(
      { message: 'A single IP address and a reason are required' },
      400
    );

  const { ip_address: ip, block_level: level, ttl } = payload;
  const operatorReason = payload.notes ?? payload.reason;
  try {
    const stores = await getBlockStores();
    if (
      !stores.edge ||
      (isAbuseGuardFamilyAssigned('ratelimit') && !stores.backend)
    )
      return reply({ message: 'Edge block store unavailable' }, 503);
    const { sbAdmin, user } = auth;
    const now = new Date();
    const [{ block: edge, unreadable }, existing] = await Promise.all([
      readEdgeBlock(stores, ip),
      sbAdmin
        .from('blocked_ips')
        .select('id, reason, expires_at')
        .eq('ip_address', ip)
        .eq('status', 'active')
        .gt('expires_at', now.toISOString()),
    ]);
    if (existing.error) throw new Error('Block lookup unavailable');
    const before = {
      unreadableEdgeRecord: unreadable,
      database: existing.data,
      edge: edge && {
        id: edge.id,
        reason: edge.reason,
        expires_at: edge.expires_at,
      },
    };
    const isBlocked = Boolean(edge || unreadable || existing.data.length);
    const blockLevelKey = REDIS_KEYS.IP_BLOCK_LEVEL(ip);
    const hasResidualLevel =
      operation === 'unblock' &&
      !isBlocked &&
      (
        await Promise.all(
          allBlockStores(stores).map((store) => store.get(blockLevelKey))
        )
      ).some((level) => level !== null);
    if (operation === 'block' && isBlocked)
      return reply({ message: 'IP already blocked' }, 409);
    if (operation === 'unblock' && !isBlocked && !hasResidualLevel)
      return reply({ message: 'IP block not found' }, 404);

    const operationId = crypto.randomUUID();
    const category = blockReason.safeParse(payload.reason).data ?? 'manual';
    let blockRecord: Tables<'blocked_ips'> | undefined;
    const duration =
      ttl ?? (level ? BLOCK_DURATIONS[level] : 100 * 365 * 24 * 3600);
    const expiresAt = new Date(now.getTime() + duration * 1000).toISOString();
    const audit = async (success: boolean) => {
      const { error } = await sbAdmin.from('abuse_events').insert({
        ip_address: ip,
        event_type: 'manual',
        endpoint: '/api/v1/infrastructure/blocked-ips',
        success,
        metadata: {
          actor: user.id,
          operation,
          operationId,
          reason: operatorReason,
          category,
          before,
          after: {
            blocked: operation === 'block',
            expiresAt: operation === 'block' ? expiresAt : null,
          },
          phase: success ? 'completed' : 'requested',
        },
      });
      if (error) throw new Error('Block audit unavailable');
    };
    await audit(false);

    if (operation === 'unblock') {
      const { error } = await sbAdmin
        .from('blocked_ips')
        .update({
          status: 'manually_unblocked',
          unblocked_at: now.toISOString(),
          unblocked_by: user.id,
          unblock_reason: operatorReason,
        })
        .eq('ip_address', ip)
        .eq('status', 'active');
      if (error) throw new Error('Block history update failed');
      const keys = [REDIS_KEYS.IP_BLOCKED(ip), REDIS_KEYS.IP_BLOCK_LEVEL(ip)];
      await Promise.all(
        allBlockStores(stores).map(async (store) => {
          await store.del(...keys);
          const remaining = await store.mget(...keys);
          if (
            remaining.length !== keys.length ||
            remaining.some((value) => value !== null)
          )
            throw new Error('Block keys still present after deletion');
        })
      );
    } else {
      const { data, error } = await sbAdmin
        .from('blocked_ips')
        .insert({
          ip_address: ip,
          reason: category,
          block_level: level,
          expires_at: expiresAt,
          metadata: {
            manual: true,
            blocked_by: user.id,
            notes: operatorReason,
          },
        })
        .select('*')
        .single();
      if (error) throw new Error('Block history insert failed');
      blockRecord = data;
      const writes = await Promise.all(
        allBlockStores(stores).map((store) =>
          store.set(
            REDIS_KEYS.IP_BLOCKED(ip),
            {
              id: data.id,
              level,
              reason: category,
              blockedAt: now.toISOString(),
              expiresAt,
            },
            { ex: Math.min(duration, maxTtl) }
          )
        )
      );
      if (writes.some((result) => result !== 'OK'))
        throw new Error('Block cache write unconfirmed');
    }
    await audit(true);
    return reply({
      ip,
      blocked: operation === 'block',
      operationId,
      message:
        operation === 'block'
          ? 'IP blocked successfully'
          : 'IP unblocked successfully',
      ...(blockRecord
        ? { data: { ...blockRecord, metadata: null, unblocked_by_user: null } }
        : {}),
    });
  } catch {
    return reply(
      {
        message:
          'Block change could not be confirmed. Inspect current state before retrying.',
      },
      503
    );
  }
}

export function POST(req: Request) {
  return mutate(req, 'block');
}

export function DELETE(req: Request) {
  return mutate(req, 'unblock');
}
