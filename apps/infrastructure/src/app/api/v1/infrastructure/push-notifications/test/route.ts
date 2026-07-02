import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  ROOT_WORKSPACE_ID,
} from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { sendCustomPushMessageBatch } from '@/lib/notifications/push-delivery';

const MAX_BROADCAST_DEVICES = 50;

const requestSchema = z
  .object({
    appFlavor: z.enum(['development', 'staging', 'production']),
    body: z.string().trim().min(1).max(MAX_LONG_TEXT_LENGTH),
    data: z.record(z.string(), z.string()).optional(),
    deliveryKind: z.enum(['notification', 'data_only']),
    deviceId: z.string().trim().max(MAX_LONG_TEXT_LENGTH).optional(),
    platform: z.enum(['all', 'android', 'ios']),
    sendToAll: z.boolean(),
    title: z.string().trim().min(1).max(MAX_NAME_LENGTH),
    token: z.string().trim().max(MAX_LONG_TEXT_LENGTH).optional(),
    userId: z.string().trim().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    const targetedFields = [value.deviceId, value.token, value.userId].filter(
      (field) => Boolean(field && field.trim().length > 0)
    ).length;

    if (value.sendToAll && targetedFields > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sendToAll'],
        message:
          'Choose either a broadcast target or a specific device filter, not both.',
      });
    }

    if (!value.sendToAll && targetedFields === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sendToAll'],
        message:
          'Provide a user, device, or token filter, or explicitly enable sendToAll.',
      });
    }
  });

async function authorizePlatformAdmin(request: Request) {
  const supabase = await createClient(request);
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const permissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
    request,
  });
  if (!permissions || permissions.withoutPermission('manage_workspace_roles')) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

async function cleanupInvalidPushTokens(sbAdmin: any, tokens: string[]) {
  if (tokens.length === 0) {
    return;
  }

  const uniqueTokens = [...new Set(tokens)];
  const { error } = await sbAdmin
    .from('notification_push_devices')
    .delete()
    .in('token', uniqueTokens);

  if (error) {
    serverLogger.error(
      '[InfrastructurePushNotifications] Failed to delete invalid push tokens:',
      error
    );
  }
}

export async function POST(request: Request) {
  const authorization = await authorizePlatformAdmin(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  const payload = requestSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: payload.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const {
    appFlavor,
    body,
    data,
    deliveryKind,
    deviceId,
    platform,
    sendToAll,
    title,
    token,
    userId,
  } = payload.data;

  let query = sbAdmin
    .from('notification_push_devices')
    .select('token')
    .eq('app_flavor', appFlavor)
    .order('last_seen_at', { ascending: false });

  if (platform !== 'all') {
    query = query.eq('platform', platform);
  }

  if (token) {
    query = query.eq('token', token);
  }

  if (deviceId) {
    query = query.eq('device_id', deviceId);
  }

  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (sendToAll) {
    query = query.limit(MAX_BROADCAST_DEVICES);
  }

  const { data: devices, error } = await query;

  if (error) {
    serverLogger.error(
      '[InfrastructurePushNotifications] Failed to load push devices:',
      error
    );
    return NextResponse.json(
      { message: 'Failed to load push devices' },
      { status: 500 }
    );
  }

  if (!devices || devices.length === 0) {
    return NextResponse.json(
      { message: 'No matching push devices were found.' },
      { status: 404 }
    );
  }

  const result = await sendCustomPushMessageBatch({
    devices,
    message: {
      title,
      body,
      data,
      dataOnly: deliveryKind === 'data_only',
    },
  });

  await cleanupInvalidPushTokens(sbAdmin, result.invalidTokens);

  return NextResponse.json({
    success: true,
    message:
      deliveryKind === 'data_only'
        ? 'Data-only push test sent.'
        : 'Push notification test sent.',
    matchedDevices: devices.length,
    deliveredCount: result.deliveredCount,
    invalidTokens: result.invalidTokens,
    invalidTokensRemoved: result.invalidTokens.length,
    truncated: sendToAll && devices.length === MAX_BROADCAST_DEVICES,
  });
}
