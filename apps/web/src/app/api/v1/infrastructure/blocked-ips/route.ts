import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  BLOCK_DURATIONS,
  REDIS_KEYS,
  WINDOW_MS,
  unblockIP,
} from '@tuturuuu/utils/abuse-protection';
import type {
  AbuseEventType,
  IPBlockStatus,
} from '@tuturuuu/utils/abuse-protection';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const UnblockSchema = z.object({
  ip_address: z.string().min(1),
  reason: z.string().max(500).optional(),
});

const BlockIPSchema = z.object({
  ip_address: z.string().min(1).max(45), // Max length for IPv6
  reason: z.enum([
    'otp_send',
    'otp_verify_failed',
    'mfa_challenge',
    'mfa_verify_failed',
    'reauth_send',
    'reauth_verify_failed',
    'password_login_failed',
    'manual',
  ] as const),
  block_level: z.number().int().min(0).max(4).default(1), // 0 = permanent
  notes: z.string().max(500).optional(),
});

// 100 years in seconds for permanent blocks
const PERMANENT_BLOCK_DURATION = 100 * 365 * 24 * 60 * 60;

export async function GET(req: Request) {
  const supabase = await createClient();

  // Check if user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Check if user is from root workspace
  const { data: rootWorkspaceUser } = await supabase
    .from('workspace_user_linked_users')
    .select('*')
    .eq('platform_user_id', user.id)
    .eq('ws_id', '00000000-0000-0000-0000-000000000000')
    .single();

  if (!rootWorkspaceUser) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  // Parse query parameters
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'active';
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);
  const ipFilter = url.searchParams.get('ip');

  // Build query
  let query = supabase
    .from('blocked_ips')
    .select('*, unblocked_by_user:unblocked_by(id, display_name)', {
      count: 'exact',
    })
    .order('blocked_at', { ascending: false });

  // Apply status filter
  if (status !== 'all') {
    query = query.eq('status', status as IPBlockStatus);
  }

  // Apply IP filter
  if (ipFilter) {
    query = query.ilike('ip_address', `%${ipFilter}%`);
  }

  // Apply pagination
  const start = (page - 1) * pageSize;
  query = query.range(start, start + pageSize - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error('Error fetching blocked IPs:', error);
    return NextResponse.json(
      { message: 'Error fetching blocked IPs' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data,
    count,
    page,
    pageSize,
    totalPages: count ? Math.ceil(count / pageSize) : 0,
  });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();

  // Check if user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Check if user is from root workspace
  const { data: rootWorkspaceUser } = await supabase
    .from('workspace_user_linked_users')
    .select('*')
    .eq('platform_user_id', user.id)
    .eq('ws_id', '00000000-0000-0000-0000-000000000000')
    .single();

  if (!rootWorkspaceUser) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { ip_address, reason } = UnblockSchema.parse(body);

    const success = await unblockIP(ip_address, user.id, reason);

    if (!success) {
      return NextResponse.json(
        { message: 'Failed to unblock IP' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'IP unblocked successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid request data', errors: error.issues },
        { status: 400 }
      );
    }

    console.error('Unexpected error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();

  // Check if user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Check if user is from root workspace
  const { data: rootWorkspaceUser } = await supabase
    .from('workspace_user_linked_users')
    .select('*')
    .eq('platform_user_id', user.id)
    .eq('ws_id', '00000000-0000-0000-0000-000000000000')
    .single();

  if (!rootWorkspaceUser) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { ip_address, reason, block_level, notes } =
      BlockIPSchema.parse(body);

    const sbAdmin = await createAdminClient();

    // Calculate expiration based on block level (0 = permanent)
    const blockDuration =
      block_level === 0
        ? PERMANENT_BLOCK_DURATION
        : BLOCK_DURATIONS[block_level as 1 | 2 | 3 | 4];
    const expiresAt = new Date(Date.now() + blockDuration * 1000);

    // Check if IP is already actively blocked
    const { data: existingBlock } = await sbAdmin
      .from('blocked_ips')
      .select('id')
      .eq('ip_address', ip_address)
      .eq('status', 'active')
      .single();

    if (existingBlock) {
      return NextResponse.json(
        { message: 'IP is already blocked' },
        { status: 409 }
      );
    }

    // Insert block record
    const { data: blockRecord, error } = await sbAdmin
      .from('blocked_ips')
      .insert({
        ip_address,
        reason: reason as AbuseEventType,
        block_level,
        expires_at: expiresAt.toISOString(),
        metadata: {
          manual: true,
          blocked_by: user.id,
          notes: notes || null,
        },
      })
      .select('*')
      .single();

    if (error) {
      console.error('Error blocking IP:', error);
      return NextResponse.json(
        { message: 'Failed to block IP' },
        { status: 500 }
      );
    }

    // Update Redis cache if available
    try {
      const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

      if (redisUrl && redisToken) {
        const { Redis } = await import('@upstash/redis');
        const redis = Redis.fromEnv();

        await Promise.all([
          redis.set(
            REDIS_KEYS.IP_BLOCKED(ip_address),
            JSON.stringify({
              id: blockRecord.id,
              level: block_level,
              reason,
              expiresAt: expiresAt.toISOString(),
              blockedAt: new Date().toISOString(),
            }),
            { ex: blockDuration }
          ),
          redis.set(REDIS_KEYS.IP_BLOCK_LEVEL(ip_address), block_level, {
            ex: WINDOW_MS.TWENTY_FOUR_HOURS / 1000,
          }),
        ]);
      }
    } catch (redisError) {
      console.warn('Redis cache update failed:', redisError);
      // Continue - DB is the source of truth
    }

    return NextResponse.json({
      message: 'IP blocked successfully',
      data: blockRecord,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid request data', errors: error.issues },
        { status: 400 }
      );
    }

    console.error('Unexpected error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
