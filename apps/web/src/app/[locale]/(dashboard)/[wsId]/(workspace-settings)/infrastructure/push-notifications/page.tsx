import { Bell } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import {
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getFirebaseMessagingConfigurationStatus } from '@/lib/notifications/firebase-admin';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';
import { PushTestForm } from './push-test-form';

export const metadata: Metadata = {
  title: 'Push Notifications',
  description:
    'Inspect registered FCM devices and send test push payloads across environments.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

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

type PushDeviceCoverage = Record<
  'development' | 'staging' | 'production',
  Record<'all' | 'ios' | 'android', number>
>;

function maskToken(token: string) {
  if (token.length <= 16) {
    return token;
  }

  return `${token.slice(0, 8)}...${token.slice(-8)}`;
}

function formatDateTime(locale: string, value: string | null) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function configBadgeVariant(
  state: ReturnType<typeof getFirebaseMessagingConfigurationStatus>['state']
): 'default' | 'destructive' | 'outline' | 'secondary' {
  switch (state) {
    case 'configured':
      return 'default';
    case 'invalid':
      return 'destructive';
    case 'partial':
      return 'secondary';
    default:
      return 'outline';
  }
}

async function countRows(
  sbAdmin: any,
  table: string,
  configure?: (query: any) => any
) {
  let query = sbAdmin.from(table).select('*', { count: 'exact', head: true });
  if (configure) {
    query = configure(query);
  }

  const { count, error } = await query;
  if (error) {
    console.error('[PushNotificationsInfra] Count query failed:', table, error);
    return 0;
  }

  return count ?? 0;
}

async function getPushDashboardData() {
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
    countRows(sbAdmin, 'notification_batches', (query) =>
      query.eq('channel', 'push').eq('status', 'pending')
    ),
    countRows(sbAdmin, 'notification_batches', (query) =>
      query.eq('channel', 'push').eq('status', 'processing')
    ),
    countRows(sbAdmin, 'notification_batches', (query) =>
      query.eq('channel', 'push').eq('status', 'sent')
    ),
    countRows(sbAdmin, 'notification_batches', (query) =>
      query.eq('channel', 'push').eq('status', 'failed')
    ),
    sbAdmin
      .from('notification_push_devices')
      .select(
        'id, user_id, device_id, token, platform, app_flavor, last_seen_at, created_at'
      )
      .order('last_seen_at', { ascending: false })
      .limit(20),
    sbAdmin
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
      '[PushNotificationsInfra] Failed to load recent devices:',
      recentDevicesResult.error
    );
  }

  if (recentBatchesResult.error) {
    console.error(
      '[PushNotificationsInfra] Failed to load recent push batches:',
      recentBatchesResult.error
    );
  }

  const recentDevices = (recentDevicesResult.data ?? []) as PushDeviceRow[];
  const recentBatches = (recentBatchesResult.data ?? []) as PushBatchRow[];

  const userIds = [...new Set(recentDevices.map((device) => device.user_id))];
  const [usersResult, privateDetailsResult] =
    userIds.length === 0
      ? [
          { data: [], error: null },
          { data: [], error: null },
        ]
      : await Promise.all([
          sbAdmin.from('users').select('id, display_name').in('id', userIds),
          sbAdmin
            .from('user_private_details')
            .select('user_id, email, full_name')
            .in('user_id', userIds),
        ]);

  if (usersResult.error) {
    console.error(
      '[PushNotificationsInfra] Failed to load user display names:',
      usersResult.error
    );
  }

  if (privateDetailsResult.error) {
    console.error(
      '[PushNotificationsInfra] Failed to load user private details:',
      privateDetailsResult.error
    );
  }

  const userNameMap = new Map<string, string>();
  for (const row of usersResult.data ?? []) {
    if (row.display_name) {
      userNameMap.set(row.id, row.display_name);
    }
  }

  const userEmailMap = new Map<string, string>();
  for (const row of privateDetailsResult.data ?? []) {
    const name = row.full_name?.trim();
    if (name && !userNameMap.has(row.user_id)) {
      userNameMap.set(row.user_id, name);
    }
    if (row.email) {
      userEmailMap.set(row.user_id, row.email);
    }
  }

  return {
    coverage: {
      development: {
        all: developmentDevices,
        ios: developmentIosDevices,
        android: developmentAndroidDevices,
      },
      production: {
        all: productionDevices,
        ios: productionIosDevices,
        android: productionAndroidDevices,
      },
      staging: {
        all: stagingDevices,
        ios: stagingIosDevices,
        android: stagingAndroidDevices,
      },
    } satisfies PushDeviceCoverage,
    recentBatches,
    recentDevices: recentDevices.map((device) => ({
      ...device,
      token_preview: maskToken(device.token),
      user_display_name: userNameMap.get(device.user_id) ?? null,
      user_email: userEmailMap.get(device.user_id) ?? null,
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
  };
}

function getDefaultAppFlavor(coverage: PushDeviceCoverage) {
  const orderedFlavors: Array<'production' | 'staging' | 'development'> = [
    'production',
    'staging',
    'development',
  ];

  return orderedFlavors.reduce<'development' | 'staging' | 'production'>(
    (bestFlavor, flavor) =>
      coverage[flavor].all > coverage[bestFlavor].all ? flavor : bestFlavor,
    'production'
  );
}

export default async function InfrastructurePushNotificationsPage({
  params,
}: Props) {
  const { locale, wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);

  const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID });
  if (!permissions) {
    redirect(`/${resolveWorkspaceId(wsId)}/settings`);
  }

  const canManagePush = !permissions.withoutPermission(
    'manage_workspace_roles'
  );
  const [rawT, firebaseConfig, dashboard] = await Promise.all([
    getTranslations('settings-account.push-notification-dashboard' as never),
    Promise.resolve(getFirebaseMessagingConfigurationStatus()),
    getPushDashboardData(),
  ]);
  const t = (key: string, values?: Record<string, unknown>) =>
    rawT(key as never, values as never);
  const defaultAppFlavor = getDefaultAppFlavor(dashboard.coverage);

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-2xl">{t('title')}</h1>
          </div>
          <p className="text-foreground/80">{t('description')}</p>
        </div>
        <Badge variant={configBadgeVariant(firebaseConfig.state)}>
          {t(`config_state.${firebaseConfig.state}`)}
        </Badge>
      </div>

      <Separator className="my-4" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              {t('summary.total_devices')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {dashboard.summary.totalDevices.toLocaleString(locale)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              {t('summary.active_24h')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {dashboard.summary.active24h.toLocaleString(locale)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              {t('summary.pending_batches')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {dashboard.summary.pendingBatches.toLocaleString(locale)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              {t('summary.failed_batches')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl text-destructive">
              {dashboard.summary.failedBatches.toLocaleString(locale)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t('form.card_title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <PushTestForm
              canSend={canManagePush}
              defaultAppFlavor={defaultAppFlavor}
              deviceCoverage={dashboard.coverage}
            />
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('config.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">
                  {t('config.source')}
                </span>
                <Badge variant="outline">
                  {t(`config_source.${firebaseConfig.source}`)}
                </Badge>
              </div>
              <div className="text-muted-foreground">
                {firebaseConfig.message}
              </div>
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <div className="font-medium">{t('config.project_id')}</div>
                <div className="mt-1 font-mono text-xs">
                  {firebaseConfig.projectId ?? t('config.not_available')}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('coverage.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="mb-2 font-medium">
                  {t('coverage.by_flavor')}
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span>{t('flavors.development')}</span>
                    <span className="font-mono">
                      {dashboard.summary.developmentDevices.toLocaleString(
                        locale
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span>{t('flavors.staging')}</span>
                    <span className="font-mono">
                      {dashboard.summary.stagingDevices.toLocaleString(locale)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span>{t('flavors.production')}</span>
                    <span className="font-mono">
                      {dashboard.summary.productionDevices.toLocaleString(
                        locale
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 font-medium">
                  {t('coverage.by_platform')}
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span>{t('platforms.ios')}</span>
                    <span className="font-mono">
                      {dashboard.summary.iosDevices.toLocaleString(locale)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span>{t('platforms.android')}</span>
                    <span className="font-mono">
                      {dashboard.summary.androidDevices.toLocaleString(locale)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border bg-muted/40 p-3">
                <div className="font-medium">{t('coverage.queue_health')}</div>
                <div className="mt-2 grid gap-1 text-muted-foreground">
                  <div>
                    {t('coverage.queue_pending', {
                      count: dashboard.summary.pendingBatches,
                    })}
                  </div>
                  <div>
                    {t('coverage.queue_processing', {
                      count: dashboard.summary.processingBatches,
                    })}
                  </div>
                  <div>
                    {t('coverage.queue_sent', {
                      count: dashboard.summary.sentBatches,
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('recent_devices.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.recentDevices.length === 0 ? (
              <div className="text-muted-foreground text-sm">
                {t('recent_devices.empty')}
              </div>
            ) : (
              dashboard.recentDevices.map((device) => (
                <div
                  key={device.id}
                  className="space-y-2 rounded-lg border border-border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {t(`flavors.${device.app_flavor}`)}
                    </Badge>
                    <Badge variant="secondary">
                      {t(`platforms.${device.platform}`)}
                    </Badge>
                  </div>
                  <div className="font-medium text-sm">
                    {device.user_display_name ??
                      device.user_email ??
                      t('recent_devices.unknown_user')}
                  </div>
                  <div className="grid gap-1 font-mono text-muted-foreground text-xs">
                    <div>{device.user_id}</div>
                    <div>{device.device_id}</div>
                    <div>{device.token_preview}</div>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t('recent_devices.last_seen', {
                      value: formatDateTime(locale, device.last_seen_at),
                    })}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('recent_batches.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.recentBatches.length === 0 ? (
              <div className="text-muted-foreground text-sm">
                {t('recent_batches.empty')}
              </div>
            ) : (
              dashboard.recentBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="space-y-2 rounded-lg border border-border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{batch.delivery_mode}</Badge>
                    <Badge
                      variant={
                        batch.status === 'failed'
                          ? 'destructive'
                          : batch.status === 'sent'
                            ? 'default'
                            : 'secondary'
                      }
                    >
                      {batch.status}
                    </Badge>
                  </div>
                  <div className="text-sm">
                    {t('recent_batches.notification_count', {
                      count: batch.notification_count,
                    })}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t('recent_batches.updated_at', {
                      value: formatDateTime(locale, batch.updated_at),
                    })}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t('recent_batches.sent_at', {
                      value: formatDateTime(locale, batch.sent_at),
                    })}
                  </div>
                  {batch.error_message ? (
                    <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-destructive text-xs">
                      {batch.error_message}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
