'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Settings2 } from '@tuturuuu/icons';
import {
  getInventorySquareSettings,
  type InventorySquareEnvironment,
} from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { SquareEventSafetyCard } from './square-event-safety-card';
import { SquareProductionSetupGuide } from './square-production-setup-guide';
import {
  SquareSettingsEditorDialog,
  type SquareSettingsEditorTab,
} from './square-settings-editor-dialog';
import { SquareSettingsSummary } from './square-settings-summary';
import {
  getEffectiveSquareSetupProgress,
  getSquareSetupProgress,
  type SquareSetupStepId,
} from './square-setup-progress';

const EDITOR_TAB_BY_STEP: Record<SquareSetupStepId, SquareSettingsEditorTab> = {
  application: 'application',
  connection: 'connection',
  device: 'terminal',
  location: 'terminal',
  webhook: 'connection',
};

export function SquareSettingsPanel({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator.square');
  const [environment, setEnvironment] =
    useState<InventorySquareEnvironment | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTab, setEditorTab] =
    useState<SquareSettingsEditorTab>('application');
  const settings = useQuery({
    queryFn: () => getInventorySquareSettings(wsId),
    queryKey: ['inventory', wsId, 'square-settings'],
  });
  const selectedEnvironment =
    environment ?? settings.data?.environment ?? 'sandbox';
  const activeAppCredential = settings.data?.appCredentials.find(
    (item) => item.environment === selectedEnvironment
  );
  const activeConnection = settings.data?.connections.find(
    (item) => item.environment === selectedEnvironment
  );
  const savedDefaultsMatchEnvironment =
    settings.data?.environment === selectedEnvironment;
  const progress = getSquareSetupProgress({
    appCredential: activeAppCredential,
    connection: activeConnection,
    deviceId: savedDefaultsMatchEnvironment
      ? (settings.data?.deviceId ?? null)
      : null,
    environment: selectedEnvironment,
    locationId: savedDefaultsMatchEnvironment
      ? (settings.data?.locationId ?? null)
      : null,
    sandboxDeviceId: savedDefaultsMatchEnvironment
      ? (settings.data?.sandboxDeviceId ?? null)
      : null,
  });
  const effectiveProgress = getEffectiveSquareSetupProgress({
    posReady:
      selectedEnvironment === 'production' &&
      Boolean(settings.data?.posReadiness.ready),
    progress,
  });
  const webhookUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const resolvedWsId = settings.data?.wsId ?? wsId;
    return `${window.location.origin}/api/v1/inventory/square/webhook/${resolvedWsId}`;
  }, [settings.data?.wsId, wsId]);
  const posCallbackUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/api/v1/inventory/square/pos/callback`;
  }, []);

  const openEditor = (step: SquareSetupStepId = 'application') => {
    setEditorTab(EDITOR_TAB_BY_STEP[step]);
    setEditorOpen(true);
  };

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-primary/10 text-primary">
            <Settings2 className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{t('settingsTitle')}</p>
              <Badge variant={effectiveProgress.ready ? 'success' : 'warning'}>
                {t('settingsProgress', {
                  completed: effectiveProgress.completed,
                  total: effectiveProgress.total,
                })}
              </Badge>
            </div>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('readOnlyHint')}
            </p>
          </div>
        </div>
        <Button
          onClick={() => openEditor()}
          size="sm"
          type="button"
          variant="outline"
        >
          <Settings2 className="size-4" />
          {t('editSettings')}
        </Button>
      </div>

      {!effectiveProgress.ready && effectiveProgress.firstIncompleteId ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dynamic-orange/30 bg-dynamic-orange/5 p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning">{t('nextStepBadge')}</Badge>
              <p className="font-semibold text-sm">
                {t(`guide.steps.${effectiveProgress.firstIncompleteId}.title`)}
              </p>
            </div>
            <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
              {t('nextStepDescription')}
            </p>
          </div>
          <Button
            onClick={() =>
              openEditor(effectiveProgress.firstIncompleteId ?? undefined)
            }
            size="sm"
            type="button"
          >
            {t('configureNextStep')}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      ) : null}

      <SquareProductionSetupGuide
        environment={selectedEnvironment}
        onConfigureStep={openEditor}
        onEnvironmentChange={setEnvironment}
        settings={settings.data}
        webhookUrl={webhookUrl}
      />
      <SquareEventSafetyCard />
      <SquareSettingsSummary
        appCredential={activeAppCredential}
        connection={activeConnection}
        environment={selectedEnvironment}
        settings={settings.data}
      />
      <SquareSettingsEditorDialog
        environment={selectedEnvironment}
        onEnvironmentChange={setEnvironment}
        onOpenChange={setEditorOpen}
        onTabChange={setEditorTab}
        open={editorOpen}
        settings={settings.data}
        tab={editorTab}
        posCallbackUrl={posCallbackUrl}
        webhookUrl={webhookUrl}
        wsId={wsId}
      />
    </section>
  );
}
