'use client';

import {
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  RefreshCw,
} from '@tuturuuu/icons';
import type {
  InventorySquareDeviceCode,
  InventorySquareEnvironment,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { SelectValueField } from './operator-form-fields';

type SelectOption = { label: string; value: string };

export type SquareTerminalSettingsProps = {
  deviceCodeName: string;
  deviceCodePending: boolean;
  deviceId: string;
  deviceOptions: SelectOption[];
  devicesPending: boolean;
  environment: InventorySquareEnvironment;
  lastDeviceCode: InventorySquareDeviceCode | null;
  locationId: string;
  locationOptions: SelectOption[];
  onCreateDeviceCode: () => void;
  onRefreshDevices: () => void;
  onSaveDefaults: () => void;
  sandboxDeviceId: string;
  sandboxDevicePlaceholder: string;
  saveDefaultsPending: boolean;
  selectedDeviceId: string;
  selectedDevicePlaceholder: string;
  selectedLocationId: string;
  selectedLocationPlaceholder: string;
  setDeviceCodeName: (value: string) => void;
  setDeviceId: (value: string) => void;
  setLocationId: (value: string) => void;
  setSandboxDeviceId: (value: string) => void;
};

function StepNumber({ children }: { children: number }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-background font-mono font-semibold text-xs">
      {children}
    </span>
  );
}

function SetupStep({
  children,
  number,
}: {
  children: ReactNode;
  number: number;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-muted/15 p-4 md:grid-cols-[auto_minmax(0,1fr)]">
      <StepNumber>{number}</StepNumber>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

export function SquareProductionTerminalSetup({
  deviceCodeName,
  deviceCodePending,
  deviceId,
  deviceOptions,
  devicesPending,
  lastDeviceCode,
  locationId,
  locationOptions,
  onCreateDeviceCode,
  onRefreshDevices,
  onSaveDefaults,
  saveDefaultsPending,
  selectedDeviceId,
  selectedDevicePlaceholder,
  selectedLocationId,
  selectedLocationPlaceholder,
  setDeviceCodeName,
  setDeviceId,
  setLocationId,
}: SquareTerminalSettingsProps) {
  const t = useTranslations('inventory.operator.square');
  const activeLocationId = locationId || selectedLocationId;

  return (
    <div className="grid gap-3 p-4">
      <SetupStep number={1}>
        <div>
          <p className="font-medium text-sm">
            {t('terminalSteps.location.title')}
          </p>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            {t('terminalSteps.location.description')}
          </p>
        </div>
        <SelectValueField
          allowEmpty={false}
          label={t('locationLabel')}
          onChange={setLocationId}
          options={locationOptions}
          placeholder={selectedLocationPlaceholder}
          value={activeLocationId}
        />
      </SetupStep>

      <SetupStep number={2}>
        <div>
          <p className="font-medium text-sm">{t('terminalSteps.name.title')}</p>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            {t('terminalSteps.name.description')}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="h-10 min-w-0 flex-1"
            onChange={(event) => setDeviceCodeName(event.target.value)}
            placeholder={t('deviceCodeNamePlaceholder')}
            value={deviceCodeName}
          />
          <Button
            disabled={deviceCodePending || !activeLocationId}
            onClick={onCreateDeviceCode}
            type="button"
          >
            {deviceCodePending
              ? t('creatingDeviceCode')
              : t('createDeviceCode')}
            <ArrowRight className="size-4" />
          </Button>
        </div>
        {!activeLocationId ? (
          <p className="text-dynamic-orange text-xs">
            {t('terminalSteps.name.locationRequired')}
          </p>
        ) : null}
      </SetupStep>

      <SetupStep number={3}>
        <div>
          <p className="font-medium text-sm">
            {t('terminalSteps.enterCode.title')}
          </p>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            {t('terminalSteps.enterCode.description')}
          </p>
        </div>
        {lastDeviceCode ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div>
              <p className="font-mono font-semibold text-2xl tracking-[0.22em]">
                {lastDeviceCode.code}
              </p>
              {lastDeviceCode.pairBy ? (
                <p className="mt-1 text-muted-foreground text-xs">
                  {t('pairingCodeExpires', {
                    date: new Date(lastDeviceCode.pairBy).toLocaleString(),
                  })}
                </p>
              ) : null}
            </div>
            <Button
              onClick={() => navigator.clipboard.writeText(lastDeviceCode.code)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Copy className="size-4" />
              {t('copyPairingCode')}
            </Button>
          </div>
        ) : (
          <p className="rounded-lg border border-border border-dashed px-3 py-4 text-muted-foreground text-xs leading-5">
            {t('terminalSteps.enterCode.empty')}
          </p>
        )}
        <Button asChild className="w-fit" size="sm" variant="ghost">
          <a
            href="https://developer.squareup.com/docs/terminal-api/integrate-square-terminal"
            rel="noreferrer"
            target="_blank"
          >
            {t('openTerminalPairingGuide')}
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      </SetupStep>

      <SetupStep number={4}>
        <div>
          <p className="font-medium text-sm">
            {t('terminalSteps.select.title')}
          </p>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            {t('terminalSteps.select.description')}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <SelectValueField
            className="min-w-[15rem] flex-1"
            emptyText={t('terminalEmpty.title')}
            label={t('deviceLabel')}
            onChange={setDeviceId}
            options={deviceOptions}
            placeholder={selectedDevicePlaceholder}
            value={deviceId || selectedDeviceId}
          />
          <Button
            disabled={devicesPending}
            onClick={onRefreshDevices}
            type="button"
            variant="outline"
          >
            <RefreshCw
              className={devicesPending ? 'size-4 animate-spin' : 'size-4'}
            />
            {t('refreshDevices')}
          </Button>
        </div>
        {deviceOptions.length === 0 ? (
          <div className="rounded-lg border border-border border-dashed p-3">
            <p className="font-medium text-sm">{t('terminalEmpty.title')}</p>
            <p className="mt-1 text-muted-foreground text-xs leading-5">
              {t('terminalEmpty.description')}
            </p>
          </div>
        ) : null}
        <Button
          className="w-fit"
          disabled={saveDefaultsPending || !(deviceId || selectedDeviceId)}
          onClick={onSaveDefaults}
          type="button"
        >
          <CheckCircle2 className="size-4" />
          {saveDefaultsPending ? t('saving') : t('saveTerminalDefault')}
        </Button>
      </SetupStep>
    </div>
  );
}
