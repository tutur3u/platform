'use client';

import {
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  MonitorSmartphone,
  RefreshCw,
  SmartphoneNfc,
} from '@tuturuuu/icons';
import type {
  InventorySquareDeviceCode,
  InventorySquareEnvironment,
} from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SelectValueField } from './operator-form-fields';
import { SquareReaderProductionSetup } from './square-reader-production-setup';
import { SquareSetupStep } from './square-setup-step';

type SelectOption = { label: string; value: string };
type SquareHardware = 'reader' | 'terminal';

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
  posCallbackUrl: string;
  posReady: boolean;
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

function HardwareChoice({
  hardware,
  onChange,
}: {
  hardware: SquareHardware | null;
  onChange: (hardware: SquareHardware) => void;
}) {
  const t = useTranslations('inventory.operator.square');

  return (
    <section className="grid gap-3 rounded-lg border border-border bg-muted/15 p-4">
      <div>
        <p className="font-medium text-sm">{t('hardware.title')}</p>
        <p className="mt-1 text-muted-foreground text-xs leading-5">
          {t('hardware.description')}
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Button
          aria-pressed={hardware === 'terminal'}
          className="h-auto items-start justify-start gap-3 whitespace-normal p-3 text-left"
          onClick={() => onChange('terminal')}
          type="button"
          variant={hardware === 'terminal' ? 'secondary' : 'outline'}
        >
          <MonitorSmartphone className="mt-0.5 size-5 shrink-0" />
          <span className="grid min-w-0 flex-1 gap-1">
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {t('hardware.terminal.title')}
              <Badge variant="success">{t('hardware.terminal.badge')}</Badge>
            </span>
            <span className="font-normal text-muted-foreground text-xs leading-5">
              {t('hardware.terminal.description')}
            </span>
          </span>
        </Button>
        <Button
          aria-pressed={hardware === 'reader'}
          className="h-auto items-start justify-start gap-3 whitespace-normal p-3 text-left"
          onClick={() => onChange('reader')}
          type="button"
          variant={hardware === 'reader' ? 'secondary' : 'outline'}
        >
          <SmartphoneNfc className="mt-0.5 size-5 shrink-0" />
          <span className="grid min-w-0 flex-1 gap-1">
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {t('hardware.reader.title')}
              <Badge variant="success">{t('hardware.reader.badge')}</Badge>
            </span>
            <span className="font-normal text-muted-foreground text-xs leading-5">
              {t('hardware.reader.description')}
            </span>
          </span>
        </Button>
      </div>
    </section>
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
  posCallbackUrl,
  posReady,
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
  const [hardware, setHardware] = useState<SquareHardware | null>(
    selectedDeviceId ? 'terminal' : null
  );
  const activeLocationId = locationId || selectedLocationId;

  return (
    <div className="grid gap-3 p-4">
      <HardwareChoice hardware={hardware} onChange={setHardware} />

      {hardware === 'reader' ? (
        <SquareReaderProductionSetup
          activeLocationId={activeLocationId}
          locationOptions={locationOptions}
          onSaveDefaults={onSaveDefaults}
          posCallbackUrl={posCallbackUrl}
          posReady={posReady}
          saveDefaultsPending={saveDefaultsPending}
          selectedLocationPlaceholder={selectedLocationPlaceholder}
          setLocationId={setLocationId}
        />
      ) : null}

      {hardware === null ? (
        <p className="rounded-lg border border-border border-dashed px-3 py-4 text-muted-foreground text-xs leading-5">
          {t('hardware.choosePrompt')}
        </p>
      ) : null}

      {hardware === 'terminal' ? (
        <>
          <SquareSetupStep number={1}>
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
          </SquareSetupStep>

          <SquareSetupStep number={2}>
            <div>
              <p className="font-medium text-sm">
                {t('terminalSteps.name.title')}
              </p>
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
          </SquareSetupStep>

          <SquareSetupStep number={3}>
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
                  onClick={() =>
                    navigator.clipboard.writeText(lastDeviceCode.code)
                  }
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
          </SquareSetupStep>

          <SquareSetupStep number={4}>
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
                <p className="font-medium text-sm">
                  {t('terminalEmpty.title')}
                </p>
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
          </SquareSetupStep>
        </>
      ) : null}
    </div>
  );
}
