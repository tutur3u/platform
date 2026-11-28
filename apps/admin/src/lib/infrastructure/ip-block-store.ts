import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { isAbuseGuardFamilyAssigned } from '@tuturuuu/utils/abuse-guard/select';
import {
  type IPBlockStatus,
  REDIS_KEYS,
} from '@tuturuuu/utils/abuse-protection';
import { isValidIpAddress } from '@tuturuuu/utils/abuse-protection/client-ip';
import { getEdgeRedisClient } from '@tuturuuu/utils/abuse-protection/edge';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { z } from 'zod';

export const blockReasons = [
  'otp_send',
  'otp_verify_failed',
  'mfa_challenge',
  'mfa_verify_failed',
  'reauth_send',
  'reauth_verify_failed',
  'password_login_failed',
  'manual',
  'api_auth_failed',
  'api_rate_limited',
  'api_abuse',
  'otp_limit_reset',
] as const;
export const ipBlockStatuses = [
  'active',
  'expired',
  'manually_unblocked',
] as const satisfies readonly IPBlockStatus[];
export function isIpBlockStatus(value: unknown): value is IPBlockStatus {
  return (
    typeof value === 'string' &&
    (ipBlockStatuses as readonly string[]).includes(value)
  );
}
export const ipLiteral = z
  .string()
  .refine(isValidIpAddress)
  .transform((ip) => ip.toLowerCase());
const keyPrefix = REDIS_KEYS.IP_BLOCKED('');
const edgeBlock = z.object({
  id: z.string().max(200),
  reason: z.enum(blockReasons),
  level: z.number().int(),
  expiresAt: z.iso.datetime(),
  blockedAt: z.iso.datetime(),
});

export async function getBlockStores() {
  const [edge, legacy, backend] = await Promise.all([
    getEdgeRedisClient(),
    isAbuseGuardFamilyAssigned('proxy') ? getUpstashRestRedisClient() : null,
    isAbuseGuardFamilyAssigned('ratelimit')
      ? getUpstashRestRedisClient({ family: 'ratelimit' })
      : null,
  ]);
  return {
    edge,
    legacy: isAbuseGuardFamilyAssigned('proxy') ? legacy : edge,
    backend,
  };
}

type Stores = Awaited<ReturnType<typeof getBlockStores>>;

export function allBlockStores({ edge, legacy, backend }: Stores) {
  return [
    ...new Set([edge, legacy, backend].filter((store) => store !== null)),
  ];
}

const unreadableBlock = Symbol('unreadable block');

function decodeBlock(ip: string, raw: unknown) {
  if (raw == null) return null;
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return unreadableBlock;
    }
  }
  const parsed = edgeBlock.safeParse(value);
  if (!parsed.success) return unreadableBlock;
  const block = parsed.data;
  if (Date.parse(block.expiresAt) <= Date.now()) return null;
  return {
    id: block.id,
    ip_address: ip,
    reason: block.reason,
    block_level: block.level,
    status: 'active' as const,
    blocked_at: block.blockedAt,
    expires_at: block.expiresAt,
    unblocked_at: null,
    unblocked_by: null,
    unblock_reason: null,
    unblocked_by_user: null,
    created_at: block.blockedAt,
    updated_at: block.blockedAt,
    metadata: { source: 'edge' },
  };
}

export async function readEdgeBlock(stores: Stores, ip: string) {
  const blocks = await Promise.all(
    allBlockStores(stores).map(async (store) =>
      decodeBlock(ip, await store.get(REDIS_KEYS.IP_BLOCKED(ip)))
    )
  );
  return {
    block:
      blocks.find((block) => block !== null && typeof block !== 'symbol') ??
      null,
    unreadable: blocks.includes(unreadableBlock),
  };
}

/** Literal search for the text address and equality against known enum members. */
export function blockedIpSearchFilter(search: string) {
  const term = search.trim().toLowerCase();
  if (!/^[0-9a-z:._-]{1,80}$/u.test(term)) return null;
  const match = blockReasons.filter((reason) => reason.includes(term));
  const ip = `ip_address.ilike.%${term.replaceAll('_', '\\_')}%`;
  return match.length ? `${ip},reason.in.(${match.join(',')})` : ip;
}

export async function listIpBlocks(
  db: TypedSupabaseClient,
  {
    ip,
    q,
    status,
    page,
    pageSize,
  }: {
    ip?: string;
    q?: string;
    status?: IPBlockStatus;
    page: number;
    pageSize: number;
  }
) {
  // Fail closed: an unrecognized status must never widen or blank the listing.
  if (status !== undefined && !isIpBlockStatus(status))
    throw new Error('Unsupported block status filter');
  const stores = await getBlockStores();
  const includesActive = !status || status === 'active';
  let edgeComplete =
    Boolean(stores.edge && stores.legacy) &&
    !isAbuseGuardFamilyAssigned('proxy') &&
    !isAbuseGuardFamilyAssigned('ratelimit');
  let candidates: NonNullable<
    Awaited<ReturnType<typeof readEdgeBlock>>['block']
  >[] = [];
  const exact = ip ?? ipLiteral.safeParse(q?.trim()).data;
  if (includesActive && exact) {
    edgeComplete =
      Boolean(stores.edge) &&
      (!isAbuseGuardFamilyAssigned('ratelimit') || Boolean(stores.backend));
    const { block, unreadable } = await readEdgeBlock(stores, exact);
    edgeComplete &&= !unreadable;
    if (block) candidates.push(block);
  } else if (includesActive && stores.legacy) {
    let cursor = '0';
    const keys = new Set<string>();
    for (let round = 0; round < 8; round++) {
      const [next, batch] = await stores.legacy.scan(cursor, {
        match: `${keyPrefix}*`,
        count: 128,
      });
      cursor = String(next);
      for (const key of batch) {
        if (isValidIpAddress(key.slice(keyPrefix.length))) keys.add(key);
      }
      if (cursor === '0' || keys.size >= 256) break;
    }
    edgeComplete &&=
      cursor === '0' &&
      keys.size <= 256 &&
      !isAbuseGuardFamilyAssigned('proxy') &&
      !isAbuseGuardFamilyAssigned('ratelimit');
    const selected = [...keys].slice(0, 256);
    for (let start = 0; start < selected.length; start += 64) {
      const batch = selected.slice(start, start + 64);
      const values = await stores.legacy.mget(...batch);
      batch.forEach((key, index) => {
        const block = decodeBlock(key.slice(keyPrefix.length), values[index]);
        if (typeof block === 'symbol') {
          edgeComplete = false;
          return;
        }
        const term = q?.trim().toLowerCase();
        if (
          block &&
          (!term ||
            block.ip_address.includes(term) ||
            block.reason.includes(term))
        )
          candidates.push(block);
      });
    }
  }

  if (candidates.length) {
    const { data, error } = await db
      .from('blocked_ips')
      .select('ip_address')
      .in(
        'ip_address',
        candidates.map((block) => block.ip_address)
      )
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString());
    if (error) throw new Error('Block reconciliation unavailable');
    const persisted = new Set(data.map((row) => row.ip_address));
    candidates = candidates.filter((block) => !persisted.has(block.ip_address));
  }
  candidates.sort(
    (a, b) =>
      b.blocked_at.localeCompare(a.blocked_at) || a.id.localeCompare(b.id)
  );

  let query = db
    .from('blocked_ips')
    .select('*, unblocked_by_user:unblocked_by(id, display_name)', {
      count: 'exact',
    })
    .order('blocked_at', { ascending: false })
    .order('id');
  if (status) query = query.eq('status', status);
  if (status === 'active')
    query = query.gt('expires_at', new Date().toISOString());
  if (ip) query = query.eq('ip_address', ip);
  if (q) {
    const filter = blockedIpSearchFilter(q);
    if (!filter) return { data: [], count: 0, edgeComplete };
    query = query.or(filter);
  }
  const offset = (page - 1) * pageSize;
  const edgeRows = candidates.slice(offset, offset + pageSize);
  const databaseStart = Math.max(0, offset - candidates.length);
  const remaining = pageSize - edgeRows.length;
  const { data, count, error } = await query.range(
    databaseStart,
    databaseStart + Math.max(1, remaining) - 1
  );
  if (error) throw new Error('Block history unavailable');
  return {
    data: [...edgeRows, ...(remaining ? (data ?? []) : [])],
    count: (count ?? 0) + candidates.length,
    edgeComplete,
  };
}
