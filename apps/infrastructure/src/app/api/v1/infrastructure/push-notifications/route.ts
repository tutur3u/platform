import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { getFirebaseMessagingConfigurationStatus } from '@/lib/notifications/firebase-admin';

type PushDeviceCoverage = Record<
  'development' | 'staging' | 'production',
  Record<'all' | 'android' | 'ios', number>
>;

type PushDeviceRow = {
  app_flavor: string;
  created_at: string;
  device_id: string;
  id: string;
  last_seen_at: string;
  platform: string;
  token: string;
  user_id: string;
};

type PushBatchRow = {
  created_at: string;
  delivery_mode: string;
  error_message: string | null;
  id: string;
  notification_count: number;
  sent_at: string | null;
  status: string;
  updated_at: string;
};

function maskToken(token: string) {
  if (token.length <= 16) return token;
  return `${token.slice(0, 8)}...${token.slice(-8)}`;
}

async function authorizePushDashboard(request: Request) {
  const permissions = await getPermissions({
    request,
    wsId: ROOT_WORKSPACE_ID,
  });

  if (!permissions?.containsPermission('view_infrastructure')) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    canManagePush: !permissions.withoutPermission('manage_workspace_roles'),
    ok: true as const,
  };
}

async function countRows(
  sbAdmin: any,
  table: string,
  configure?: (query: any) => any,
  schema: 'public' | 'private' = 'public'
) {
  const client = schema === 'private' ? sbAdmin.schema('private') : sbAdmin;
  let query = client.from(table).select('*', { count: 'exact', head: true });
  if (configure) query = configure(query);

  const { count, error } = await query;
  if (error) {
    console.error(
      '[SettingsDialogPushNotifications] Count query failed',
      table,
      error
    );
    return 0;
  }

  return count ?? 0;
}

export async function GET(request: Request) {
  await connection();

  const authorization = await authorizePushDashboard(request);
  if (!authorization.ok) return authorization.response;

  const sbAdmin = await createAdminClient();
  const now = Date.now();
  const active24hThreshold = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const active7dThreshold = new Date(
    now - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    totalDevices,
    active24h,
    active7d,
    developmentDevices,
    developmentIosDevices,
    developmentAndroidDevices,
    stagingDevices,
    stagingIosDevices,
    stagingAndroidDevices,
    productionDevices,
    productionIosDevices,
    productionAndroidDevices,
    iosDevices,
    androidDevices,
    pendingBatches,
    processingBatches,
    sentBatches,
    failedBatches,
    recentDevicesResult,
    recentBatchesResult,
  ] = await Promise.all([
    countRows(sbAdmin, 'notification_push_devices'),
    countRows(sbAdmin, 'notification_push_devices', (query) =>
      query.gte('last_seen_at', active24hThreshold)
    ),
    countRows(sbAdmin, 'notification_push_devices', (query) =>
      query.gte('last_seen_at', active7dThreshold)
    ),
    countRows(sbAdmin, 'notification_push_devices', (query) =>
      query.eq('app_flavor', 'development')
    ),
    countRows(sbAdmin, 'notification_push_devices', (query) =>
      query.eq('app_flavor', 'development').eq('platform', 'ios')
    ),
    countRows(sbAdmin, 'notification_push_devices', (query) =>
      query.eq('app_flavor', 'development').eq('platform', 'android')
    ),
    countRows(sbAdmin, 'notification_push_devices', (query) =>
      query.eq('app_flavor', 'staging')
    ),
    countRows(sbAdmin, 'notification_push_devices', (query) =>
      query.eq('app_flavor', 'staging').eq('platform', 'ios')
    ),
    countRows(sbAdmin, 'notification_push_devices', (query) =>
      query.eq('app_flavor', 'staging').eq('platform', 'android')
    ),
    countRows(sbAdmin, 'notification_push_devices', (query) =>
      query.eq('app_flavor', 'production')
    ),
    countRows(sbAdmin, 'notification_push_devices', (query) =>
      query.eq('app_flavor', 'production').eq('platform', 'ios')
    ),
    countRows(sbAdmin, 'notification_push_devices', (query) =>
      query.eq('app_flavor', 'production').eq('platform', 'android')
    ),
    countRows(sbAdmin, 'notification_push_devices', (query) =>
      query.eq('platform', 'ios')
    ),
    countRows(sbAdmin, 'notification_push_devices', (query) =>
      query.eq('platform', 'android')
    ),
    countRows(
      sbAdmin,
      'notification_batches',
      (query) => query.eq('channel', 'push').eq('status', 'pending'),
      'private'
    ),
    countRows(
      sbAdmin,
      'notification_batches',
      (query) => query.eq('channel', 'push').eq('status', 'processing'),
      'private'
    ),
    countRows(
      sbAdmin,
      'notification_batches',
      (query) => query.eq('channel', 'push').eq('status', 'sent'),
      'private'
    ),
    countRows(
      sbAdmin,
      'notification_batches',
      (query) => query.eq('channel', 'push').eq('status', 'failed'),
      'private'
    ),
    sbAdmin
      .from('notification_push_devices')
      .select(
        'id, user_id, device_id, token, platform, app_flavor, last_seen_at, created_at'
      )
      .order('last_seen_at', { ascending: false })
      .limit(20),
    sbAdmin
      .schema('private')
      .from('notification_batches')
      .select(
        'id, status, delivery_mode, notification_count, created_at, updated_at, sent_at, error_message'
      )
      .eq('channel', 'push')
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  if (recentDevicesResult.error) {
    console.error(
      '[SettingsDialogPushNotifications] Failed to load recent devices',
      recentDevicesResult.error
    );
  }

  if (recentBatchesResult.error) {
    console.error(
      '[SettingsDialogPushNotifications] Failed to load recent batches',
      recentBatchesResult.error
    );
  }

  const recentDevices = (recentDevicesResult.data ?? []) as PushDeviceRow[];
  const recentBatches = (recentBatchesResult.data ?? []) as PushBatchRow[];
  const firebaseConfig = getFirebaseMessagingConfigurationStatus();

  return NextResponse.json({
    canManagePush: authorization.canManagePush,
    config: {
      message: firebaseConfig.message,
      projectId: firebaseConfig.projectId,
      source: firebaseConfig.source,
      state: firebaseConfig.state,
    },
    coverage: {
      development: {
        all: developmentDevices,
        android: developmentAndroidDevices,
        ios: developmentIosDevices,
      },
      production: {
        all: productionDevices,
        android: productionAndroidDevices,
        ios: productionIosDevices,
      },
      staging: {
        all: stagingDevices,
        android: stagingAndroidDevices,
        ios: stagingIosDevices,
      },
    } satisfies PushDeviceCoverage,
    recentBatches,
    recentDevices: recentDevices.map((device) => ({
      ...device,
      token_preview: maskToken(device.token),
      token: undefined,
    })),
    summary: {
      active24h,
      active7d,
      androidDevices,
      developmentDevices,
      failedBatches,
      iosDevices,
      pendingBatches,
      processingBatches,
      productionDevices,
      sentBatches,
      stagingDevices,
      totalDevices,
    },
  });
}
