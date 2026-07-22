'use client';

import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  MonitorSmartphone,
  RefreshCw,
} from '@tuturuuu/icons';
import {
  createInventorySquareDeviceCode,
  type InventorySquareDeviceCode,
  type InventorySquareLocation,
} from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Dialog } from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';
import { SquareSetupStep } from './square-setup-step';

export function PosDevicePairingDialog({
  defaultLocationId,
  locations,
  onOpenChange,
  onRefreshDevices,
  open,
  refreshingDevices,
  wsId,
}: {
  defaultLocationId?: string | null;
  locations: InventorySquareLocation[];
  onOpenChange: (open: boolean) => void;
  onRefreshDevices: () => void;
  open: boolean;
  refreshingDevices: boolean;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.posDevices');
  const [deviceName, setDeviceName] = useState('');
  const [locationId, setLocationId] = useState(defaultLocationId ?? '');
  const [deviceCode, setDeviceCode] =
    useState<InventorySquareDeviceCode | null>(null);
  const createCode = useMutation({
    mutationFn: () =>
      createInventorySquareDeviceCode(wsId, {
        locationId: locationId || undefined,
        name: deviceName.trim() || undefined,
      }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('pairing.error')),
    onSuccess: ({ data }) => {
      setDeviceCode(data);
      toast.success(t('pairing.created'));
    },
  });

  useEffect(() => {
    if (open && defaultLocationId) {
      setLocationId((current) => current || defaultLocationId);
    }
  }, [defaultLocationId, open]);

  const close = (nextOpen: boolean) => {
    if (!nextOpen) {
      setDeviceName('');
      setLocationId(defaultLocationId ?? '');
      setDeviceCode(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={close} open={open}>
      <OperatorDialogContent mobileFullscreen size="md">
        <OperatorDialogHeader
          description={t('pairing.description')}
          mobileCollapsibleDescription
          title={t('pairing.title')}
        />
        <OperatorDialogBody className="grid gap-3">
          <SquareSetupStep number={1}>
            <div>
              <p className="font-medium text-sm">{t('pairing.location')}</p>
              <p className="mt-1 text-muted-foreground text-xs leading-5">
                {t('pairing.locationDescription')}
              </p>
            </div>
            <Select onValueChange={setLocationId} value={locationId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('pairing.locationPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SquareSetupStep>

          <SquareSetupStep number={2}>
            <div>
              <p className="font-medium text-sm">{t('pairing.name')}</p>
              <p className="mt-1 text-muted-foreground text-xs leading-5">
                {t('pairing.nameDescription')}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                className="min-w-0 flex-1"
                onChange={(event) => setDeviceName(event.target.value)}
                placeholder={t('pairing.namePlaceholder')}
                value={deviceName}
              />
              <Button
                disabled={
                  createCode.isPending || !locationId || !deviceName.trim()
                }
                onClick={() => createCode.mutate()}
                type="button"
              >
                {createCode.isPending
                  ? t('pairing.creating')
                  : t('pairing.create')}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </SquareSetupStep>

          <SquareSetupStep number={3}>
            <div>
              <p className="font-medium text-sm">{t('pairing.enter')}</p>
              <p className="mt-1 text-muted-foreground text-xs leading-5">
                {t('pairing.enterDescription')}
              </p>
            </div>
            {deviceCode ? (
              <div className="grid gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono font-semibold text-2xl tracking-[0.18em]">
                      {deviceCode.code}
                    </p>
                    <Badge variant="success">{t('pairing.ready')}</Badge>
                  </div>
                  {deviceCode.pairBy ? (
                    <p className="mt-1 text-muted-foreground text-xs">
                      {t('pairing.expires', {
                        date: new Date(deviceCode.pairBy).toLocaleString(),
                      })}
                    </p>
                  ) : null}
                </div>
                <Button
                  onClick={() => navigator.clipboard.writeText(deviceCode.code)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Copy className="size-4" />
                  {t('pairing.copy')}
                </Button>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/20 p-4 text-muted-foreground text-sm leading-6">
                <MonitorSmartphone className="mt-0.5 size-4 shrink-0" />
                {t('pairing.codeEmpty')}
              </div>
            )}
          </SquareSetupStep>

          <SquareSetupStep number={4}>
            <div>
              <p className="font-medium text-sm">{t('pairing.finish')}</p>
              <p className="mt-1 text-muted-foreground text-xs leading-5">
                {t('pairing.finishDescription')}
              </p>
            </div>
            <Button
              className="w-fit"
              disabled={refreshingDevices}
              onClick={onRefreshDevices}
              type="button"
              variant="outline"
            >
              <RefreshCw
                className={refreshingDevices ? 'size-4 animate-spin' : 'size-4'}
              />
              {t('refresh')}
            </Button>
          </SquareSetupStep>
        </OperatorDialogBody>
        <OperatorDialogFooter>
          <Button onClick={() => close(false)} type="button">
            <CheckCircle2 className="size-4" />
            {t('pairing.done')}
          </Button>
        </OperatorDialogFooter>
      </OperatorDialogContent>
    </Dialog>
  );
}
