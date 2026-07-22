'use client';

import {
  CheckCircle2,
  CreditCard,
  MapPin,
  MonitorSmartphone,
  Star,
} from '@tuturuuu/icons';
import type { InventorySquareDevice } from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { isSquareDeviceReady } from './pos-device-management-model';

export function PosDeviceCard({
  device,
  isDefault,
  locationName,
  onMakeDefault,
  saving,
}: {
  device: InventorySquareDevice;
  isDefault: boolean;
  locationName: string;
  onMakeDefault: () => void;
  saving: boolean;
}) {
  const t = useTranslations('inventory.operator.posDevices');
  const ready = isSquareDeviceReady(device.status);

  return (
    <article className="grid gap-4 rounded-xl border border-border bg-card p-4 shadow-foreground/[0.02] shadow-sm">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-primary/10 text-primary">
            <MonitorSmartphone className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-semibold text-sm">{device.name}</h2>
              {isDefault ? (
                <Badge className="gap-1" variant="secondary">
                  <Star className="size-3" />
                  {t('defaultBadge')}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 truncate font-mono text-muted-foreground text-xs">
              {device.id}
            </p>
          </div>
        </div>
        <Badge variant={ready ? 'success' : 'warning'}>
          {device.status ?? t('unknownStatus')}
        </Badge>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{locationName}</span>
        </p>
        <p className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <CreditCard className="size-3.5 shrink-0" />
          <span className="truncate">
            {device.productType ?? t('terminalProduct')}
          </span>
        </p>
      </div>

      <Button
        className="w-full"
        disabled={isDefault || saving}
        onClick={onMakeDefault}
        size="sm"
        type="button"
        variant={isDefault ? 'secondary' : 'outline'}
      >
        {isDefault ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <Star className="size-4" />
        )}
        {isDefault ? t('defaultActive') : t('makeDefault')}
      </Button>
    </article>
  );
}

export function PosDeviceSummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/35 text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold text-xl tabular-nums">{value}</p>
        <p className="text-muted-foreground text-xs">{label}</p>
      </div>
    </div>
  );
}
