'use client';

import {
  CreditCard,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from '@tuturuuu/icons';
import type { InventorySquareCheckoutOptions } from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';

type Props = {
  errorMessage?: string | null;
  isLoading: boolean;
  onDeviceChange: (deviceId: string) => void;
  onRetry: () => void;
  options?: InventorySquareCheckoutOptions;
  selectedDeviceId: string;
};

export function SquareCheckoutRouting({
  errorMessage,
  isLoading,
  onDeviceChange,
  onRetry,
  options,
  selectedDeviceId,
}: Props) {
  const t = useTranslations('storefront');

  if (isLoading) {
    return (
      <div className="grid gap-3 rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-full max-w-sm" />
          </div>
        </div>
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (errorMessage || !options?.staffAuthorized) {
    return (
      <div className="grid gap-3 rounded-lg border border-dynamic-red/25 bg-dynamic-red/5 p-4">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-dynamic-red" />
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-sm">
              {t('squareStaffRequiredTitle')}
            </p>
            <p className="text-muted-foreground text-sm leading-5">
              {errorMessage ?? t('squareStaffRequiredDescription')}
            </p>
          </div>
        </div>
        <Button className="w-fit" onClick={onRetry} size="sm" variant="outline">
          <RefreshCw className="size-4" />
          {t('squareCheckAccessAgain')}
        </Button>
      </div>
    );
  }

  if (options.routing === 'current_device') {
    return (
      <div className="grid gap-3 rounded-lg border border-dynamic-blue/25 bg-dynamic-blue/5 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background">
            <MonitorSmartphone className="size-4 text-dynamic-blue" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-sm">
                {t('squareCurrentDeviceTitle')}
              </p>
              <Badge variant="secondary">{t('squarePosApp')}</Badge>
            </div>
            <p className="text-muted-foreground text-sm leading-5">
              {t('squareCurrentDeviceDescription')}
            </p>
          </div>
        </div>
        <p className="flex items-center gap-2 text-muted-foreground text-xs">
          <ShieldCheck className="size-3.5 text-dynamic-green" />
          {t('squareStaffProtection')}
        </p>
      </div>
    );
  }

  const devices = options.devices ?? [];
  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/35">
          <CreditCard className="size-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-sm">
              {t('squarePaymentStationTitle')}
            </p>
            <Badge variant="outline">{t('squareTerminal')}</Badge>
          </div>
          <p className="text-muted-foreground text-sm leading-5">
            {t('squarePaymentStationDescription')}
          </p>
        </div>
      </div>

      {devices.length > 0 ? (
        <Select value={selectedDeviceId} onValueChange={onDeviceChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('squareChooseTerminal')} />
          </SelectTrigger>
          <SelectContent>
            {devices.map((device) => (
              <SelectItem key={device.id} value={device.id}>
                {device.name}
                {device.status ? ` · ${device.status.toLowerCase()}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/25 p-3 text-muted-foreground text-sm leading-5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {t('squareNoTerminalDescription')}
        </div>
      )}
    </div>
  );
}
