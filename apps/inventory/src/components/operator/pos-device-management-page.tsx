'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink,
  MonitorSmartphone,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  SmartphoneNfc,
  Star,
  TriangleAlert,
} from '@tuturuuu/icons';
import {
  getInventorySquareSettings,
  type InventorySquareDevice,
  listInventorySquareDevices,
  listInventorySquareLocations,
  updateInventorySquareSettings,
} from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { SectionShell, StatePanel } from './operator-shell';
import { PosDeviceCard, PosDeviceSummaryCard } from './pos-device-card';
import { getPosDeviceSummary } from './pos-device-management-model';
import { PosDevicePairingDialog } from './pos-device-pairing-dialog';

export function PosDeviceManagementPage({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator.posDevices');
  const queryClient = useQueryClient();
  const [pairingOpen, setPairingOpen] = useState(false);
  const settings = useQuery({
    queryFn: () => getInventorySquareSettings(wsId),
    queryKey: ['inventory', wsId, 'square-settings'],
  });
  const environment = settings.data?.environment ?? 'sandbox';
  const activeConnection = settings.data?.connections.find(
    (connection) => connection.environment === environment
  );
  const connectionReady = activeConnection?.status === 'ready';
  const locations = useQuery({
    enabled: connectionReady,
    queryFn: () => listInventorySquareLocations(wsId),
    queryKey: ['inventory', wsId, 'square-locations', environment],
  });
  const devices = useQuery({
    enabled: connectionReady,
    queryFn: () => listInventorySquareDevices(wsId),
    queryKey: ['inventory', wsId, 'square-devices', environment],
  });
  const locationNames = useMemo(
    () =>
      new Map(
        (locations.data?.data ?? []).map((location) => [
          location.id,
          location.name,
        ])
      ),
    [locations.data?.data]
  );
  const deviceRows = useMemo(() => {
    const rows = devices.data?.data ?? [];
    if (
      environment !== 'sandbox' ||
      !settings.data?.sandboxDeviceId ||
      rows.some((device) => device.id === settings.data?.sandboxDeviceId)
    ) {
      return rows;
    }

    return [
      {
        code: null,
        id: settings.data.sandboxDeviceId,
        locationId: settings.data.locationId,
        name: t('sandboxTerminal'),
        pairedAt: null,
        productType: 'TERMINAL_API',
        status: 'SANDBOX',
        updatedAt: null,
      },
      ...rows,
    ];
  }, [devices.data?.data, environment, settings.data, t]);
  const defaultDeviceId =
    environment === 'sandbox'
      ? settings.data?.sandboxDeviceId
      : settings.data?.deviceId;
  const summary = getPosDeviceSummary(deviceRows, defaultDeviceId);
  const setDefault = useMutation({
    mutationFn: (device: InventorySquareDevice) => {
      const locationId = device.locationId ?? settings.data?.locationId ?? null;
      return updateInventorySquareSettings(wsId, {
        ...(environment === 'sandbox'
          ? { sandboxDeviceId: device.id }
          : { deviceId: device.id, deviceName: device.name }),
        environment,
        locationId,
        locationName:
          (locationId ? locationNames.get(locationId) : null) ??
          settings.data?.locationName ??
          null,
      });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('saveError')),
    onSuccess: () => {
      toast.success(t('defaultSaved'));
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'square-settings'],
      });
    },
  });
  const refreshDevices = () => {
    void Promise.all([devices.refetch(), locations.refetch()]);
  };

  return (
    <SectionShell
      actions={
        <>
          <Button asChild size="sm" variant="outline">
            <Link href={`/${wsId}/payments`}>
              <Settings2 className="size-4" />
              {t('connectionSettings')}
            </Link>
          </Button>
          <Button
            disabled={
              !connectionReady ||
              environment !== 'production' ||
              locations.isPending ||
              (locations.data?.data.length ?? 0) === 0
            }
            onClick={() => setPairingOpen(true)}
            size="sm"
            type="button"
          >
            <Plus className="size-4" />
            {t('pairDevice')}
          </Button>
        </>
      }
      description={t('description')}
      icon={<MonitorSmartphone className="size-5" />}
      title={t('title')}
    >
      {settings.isPending ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton className="h-20 rounded-xl" key={index.toString()} />
          ))}
        </div>
      ) : settings.isError ? (
        <StatePanel
          actionLabel={t('retry')}
          description={t('loadErrorDescription')}
          onAction={() => settings.refetch()}
          title={t('loadErrorTitle')}
          tone="danger"
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <PosDeviceSummaryCard
              icon={<MonitorSmartphone className="size-4" />}
              label={t('metrics.paired')}
              value={summary.total}
            />
            <PosDeviceSummaryCard
              icon={<ShieldCheck className="size-4" />}
              label={t('metrics.ready')}
              value={summary.ready}
            />
            <PosDeviceSummaryCard
              icon={<Star className="size-4" />}
              label={t('metrics.default')}
              value={summary.defaultDevice?.name ?? t('notSelected')}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="flex items-start gap-3 rounded-xl border border-dynamic-blue/25 bg-dynamic-blue/5 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg border bg-background text-dynamic-blue">
                <MonitorSmartphone className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-sm">{t('terminal.title')}</p>
                  <Badge variant="outline">
                    {t(`environment.${environment}`)}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground text-sm leading-6">
                  {t('terminal.description')}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-muted/35">
                <SmartphoneNfc className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-sm">{t('posApp.title')}</p>
                  <Badge variant="secondary">{t('posApp.badge')}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground text-sm leading-6">
                  {t('posApp.description')}
                </p>
                <Button
                  asChild
                  className="mt-2 -ml-2"
                  size="sm"
                  variant="ghost"
                >
                  <a
                    href="https://squareup.com/help/us/en/article/5639-set-up-your-square-reader-for-contactless-and-chip"
                    rel="noreferrer"
                    target="_blank"
                  >
                    {t('posApp.guide')}
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              </div>
            </div>
          </div>

          {!connectionReady ? (
            <div className="flex flex-col gap-3 rounded-xl border border-dynamic-orange/30 bg-dynamic-orange/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-dynamic-orange" />
                <div>
                  <p className="font-semibold text-sm">
                    {t('connectionRequired.title')}
                  </p>
                  <p className="mt-1 text-muted-foreground text-sm leading-6">
                    {t('connectionRequired.description')}
                  </p>
                </div>
              </div>
              <Button asChild size="sm">
                <Link href={`/${wsId}/payments`}>
                  {t('connectionRequired.action')}
                </Link>
              </Button>
            </div>
          ) : (
            <section className="grid gap-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{t('pairedTitle')}</h2>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {t('pairedDescription')}
                  </p>
                </div>
                <Button
                  disabled={devices.isFetching}
                  onClick={refreshDevices}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RefreshCw
                    className={
                      devices.isFetching ? 'size-4 animate-spin' : 'size-4'
                    }
                  />
                  {t('refresh')}
                </Button>
              </div>

              {devices.isError ? (
                <StatePanel
                  actionLabel={t('retry')}
                  description={t('deviceLoadErrorDescription')}
                  onAction={() => devices.refetch()}
                  title={t('deviceLoadErrorTitle')}
                  tone="danger"
                />
              ) : devices.isPending ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton
                      className="h-52 rounded-xl"
                      key={index.toString()}
                    />
                  ))}
                </div>
              ) : deviceRows.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {deviceRows.map((device) => (
                    <PosDeviceCard
                      device={device}
                      isDefault={device.id === defaultDeviceId}
                      key={device.id}
                      locationName={
                        (device.locationId
                          ? locationNames.get(device.locationId)
                          : null) ?? t('unknownLocation')
                      }
                      onMakeDefault={() => setDefault.mutate(device)}
                      saving={setDefault.isPending}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid min-h-52 place-items-center rounded-xl border border-dashed bg-muted/15 p-6 text-center">
                  <div className="max-w-sm">
                    <span className="mx-auto grid size-11 place-items-center rounded-xl border bg-background">
                      <MonitorSmartphone className="size-5 text-muted-foreground" />
                    </span>
                    <p className="mt-3 font-semibold">{t('empty.title')}</p>
                    <p className="mt-1 text-muted-foreground text-sm leading-6">
                      {environment === 'production'
                        ? t('empty.productionDescription')
                        : t('empty.sandboxDescription')}
                    </p>
                    {environment === 'production' ? (
                      <Button
                        className="mt-4"
                        onClick={() => setPairingOpen(true)}
                        size="sm"
                        type="button"
                      >
                        <Plus className="size-4" />
                        {t('pairDevice')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}

      <PosDevicePairingDialog
        defaultLocationId={settings.data?.locationId}
        locations={locations.data?.data ?? []}
        onOpenChange={setPairingOpen}
        onRefreshDevices={refreshDevices}
        open={pairingOpen}
        refreshingDevices={devices.isFetching}
        wsId={wsId}
      />
    </SectionShell>
  );
}
