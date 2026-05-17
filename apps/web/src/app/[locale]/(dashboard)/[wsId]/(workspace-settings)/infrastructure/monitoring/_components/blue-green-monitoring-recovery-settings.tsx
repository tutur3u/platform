'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2, Save, ServerCog } from '@tuturuuu/icons';
import {
  type BlueGreenMonitoringSnapshot,
  updateBlueGreenDockerRecoverySettings,
} from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

function numberInput(value: number | null) {
  return value == null ? '' : String(value);
}

function parseOptionalPositiveInteger(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseRequiredPositiveInteger(value: string, fallback: number) {
  return parseOptionalPositiveInteger(value) ?? fallback;
}

function parseEmailList(value: string) {
  return [
    ...new Set(
      value
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
    ),
  ];
}

function stringArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function BlueGreenMonitoringRecoverySettings({
  snapshot,
}: {
  snapshot: BlueGreenMonitoringSnapshot;
}) {
  const t = useTranslations('blue-green-monitoring');
  const queryClient = useQueryClient();
  const settings = snapshot.control.dockerRecoverySettings;
  const [dockerRestartDisabled, setDockerRestartDisabled] = useState(
    settings.dockerRestartDisabled
  );
  const [dockerRestartAfterMs, setDockerRestartAfterMs] = useState(
    numberInput(settings.dockerRestartAfterMs)
  );
  const [dockerRestartCooldownMs, setDockerRestartCooldownMs] = useState(
    numberInput(settings.dockerRestartCooldownMs)
  );
  const [dockerRecoveryPollMs, setDockerRecoveryPollMs] = useState(
    numberInput(settings.dockerRecoveryPollMs)
  );
  const [dockerRecoveryTimeoutMs, setDockerRecoveryTimeoutMs] = useState(
    numberInput(settings.dockerRecoveryTimeoutMs)
  );
  const [postRestartCommandTimeoutMs, setPostRestartCommandTimeoutMs] =
    useState(numberInput(settings.postRestartCommandTimeoutMs));
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(
    settings.emailAlertsEnabled
  );
  const [emailAlertRecipients, setEmailAlertRecipients] = useState(
    settings.emailAlertRecipients.join(', ')
  );
  const [emailAlertCooldownMs, setEmailAlertCooldownMs] = useState(
    numberInput(settings.emailAlertCooldownMs)
  );
  const draftSettings = useMemo(
    () => ({
      dockerRecoveryPollMs: parseRequiredPositiveInteger(
        dockerRecoveryPollMs,
        settings.dockerRecoveryPollMs
      ),
      dockerRecoveryTimeoutMs: parseOptionalPositiveInteger(
        dockerRecoveryTimeoutMs
      ),
      dockerRestartAfterMs: parseOptionalPositiveInteger(dockerRestartAfterMs),
      dockerRestartCooldownMs: parseRequiredPositiveInteger(
        dockerRestartCooldownMs,
        settings.dockerRestartCooldownMs
      ),
      dockerRestartDisabled,
      emailAlertCooldownMs: parseRequiredPositiveInteger(
        emailAlertCooldownMs,
        settings.emailAlertCooldownMs
      ),
      emailAlertRecipients: parseEmailList(emailAlertRecipients),
      emailAlertsEnabled,
      postRestartCommandTimeoutMs: parseRequiredPositiveInteger(
        postRestartCommandTimeoutMs,
        settings.postRestartCommandTimeoutMs
      ),
    }),
    [
      dockerRecoveryPollMs,
      dockerRecoveryTimeoutMs,
      dockerRestartAfterMs,
      dockerRestartCooldownMs,
      dockerRestartDisabled,
      emailAlertCooldownMs,
      emailAlertRecipients,
      emailAlertsEnabled,
      postRestartCommandTimeoutMs,
      settings.dockerRecoveryPollMs,
      settings.dockerRestartCooldownMs,
      settings.emailAlertCooldownMs,
      settings.postRestartCommandTimeoutMs,
    ]
  );
  const isDirty =
    draftSettings.dockerRecoveryPollMs !== settings.dockerRecoveryPollMs ||
    draftSettings.dockerRecoveryTimeoutMs !==
      settings.dockerRecoveryTimeoutMs ||
    draftSettings.dockerRestartAfterMs !== settings.dockerRestartAfterMs ||
    draftSettings.dockerRestartCooldownMs !==
      settings.dockerRestartCooldownMs ||
    draftSettings.dockerRestartDisabled !== settings.dockerRestartDisabled ||
    draftSettings.emailAlertCooldownMs !== settings.emailAlertCooldownMs ||
    !stringArraysEqual(
      draftSettings.emailAlertRecipients,
      settings.emailAlertRecipients
    ) ||
    draftSettings.emailAlertsEnabled !== settings.emailAlertsEnabled ||
    draftSettings.postRestartCommandTimeoutMs !==
      settings.postRestartCommandTimeoutMs;

  useEffect(() => {
    setDockerRestartDisabled(settings.dockerRestartDisabled);
    setDockerRestartAfterMs(numberInput(settings.dockerRestartAfterMs));
    setDockerRestartCooldownMs(numberInput(settings.dockerRestartCooldownMs));
    setDockerRecoveryPollMs(numberInput(settings.dockerRecoveryPollMs));
    setDockerRecoveryTimeoutMs(numberInput(settings.dockerRecoveryTimeoutMs));
    setPostRestartCommandTimeoutMs(
      numberInput(settings.postRestartCommandTimeoutMs)
    );
    setEmailAlertsEnabled(settings.emailAlertsEnabled);
    setEmailAlertRecipients(settings.emailAlertRecipients.join(', '));
    setEmailAlertCooldownMs(numberInput(settings.emailAlertCooldownMs));
  }, [settings]);

  const mutation = useMutation({
    mutationFn: () => {
      return updateBlueGreenDockerRecoverySettings(draftSettings);
    },
    onSuccess: async () => {
      toast.success(t('recovery_settings.save_success'));
      await queryClient.invalidateQueries({
        queryKey: ['infrastructure', 'monitoring', 'blue-green'],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('recovery_settings.save_error')
      );
    },
  });

  return (
    <Collapsible
      asChild
      className="rounded-lg border border-border/60 bg-background"
    >
      <section>
        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
          <CollapsibleTrigger asChild>
            <button
              className="group flex min-w-0 flex-1 items-start justify-between gap-4 text-left"
              type="button"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase">
                  <ServerCog className="h-4 w-4" />
                  <span>{t('recovery_settings.badge')}</span>
                </div>
                <h3 className="mt-2 font-semibold text-xl">
                  {t('recovery_settings.title')}
                </h3>
                <p className="mt-2 text-muted-foreground text-sm">
                  {t('recovery_settings.description')}
                </p>
                <p className="mt-2 text-muted-foreground text-xs">
                  {t('recovery_settings.updated', {
                    time: settings.updatedAt ?? t('states.none'),
                  })}
                </p>
              </div>
              <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </button>
          </CollapsibleTrigger>

          <Button
            disabled={mutation.isPending || !isDirty}
            onClick={() => mutation.mutate()}
            type="button"
          >
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {mutation.isPending
              ? t('recovery_settings.saving')
              : t('recovery_settings.save')}
          </Button>
        </div>

        <CollapsibleContent>
          <div className="grid gap-4 border-border/60 border-t p-4 lg:grid-cols-3">
            <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="docker-restart-disabled">
                  {t('recovery_settings.restart_disabled')}
                </Label>
                <Switch
                  checked={dockerRestartDisabled}
                  id="docker-restart-disabled"
                  onCheckedChange={setDockerRestartDisabled}
                />
              </div>
              <SettingInput
                id="docker-restart-after-ms"
                label={t('recovery_settings.restart_after')}
                onChange={setDockerRestartAfterMs}
                value={dockerRestartAfterMs}
              />
              <SettingInput
                id="docker-restart-cooldown-ms"
                label={t('recovery_settings.restart_cooldown')}
                onChange={setDockerRestartCooldownMs}
                value={dockerRestartCooldownMs}
              />
            </div>

            <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
              <SettingInput
                id="docker-recovery-poll-ms"
                label={t('recovery_settings.poll')}
                onChange={setDockerRecoveryPollMs}
                value={dockerRecoveryPollMs}
              />
              <SettingInput
                id="docker-recovery-timeout-ms"
                label={t('recovery_settings.timeout')}
                onChange={setDockerRecoveryTimeoutMs}
                placeholder={t('recovery_settings.no_timeout')}
                value={dockerRecoveryTimeoutMs}
              />
              <SettingInput
                id="docker-post-restart-timeout-ms"
                label={t('recovery_settings.command_timeout')}
                onChange={setPostRestartCommandTimeoutMs}
                value={postRestartCommandTimeoutMs}
              />
            </div>

            <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="docker-email-alerts-enabled">
                  {t('recovery_settings.email_alerts_enabled')}
                </Label>
                <Switch
                  checked={emailAlertsEnabled}
                  id="docker-email-alerts-enabled"
                  onCheckedChange={setEmailAlertsEnabled}
                />
              </div>
              <SettingInput
                id="docker-email-alert-recipients"
                inputMode="email"
                label={t('recovery_settings.email_recipients')}
                onChange={setEmailAlertRecipients}
                placeholder={t(
                  'recovery_settings.email_recipients_placeholder'
                )}
                value={emailAlertRecipients}
              />
              <SettingInput
                id="docker-email-alert-cooldown-ms"
                label={t('recovery_settings.email_cooldown')}
                onChange={setEmailAlertCooldownMs}
                value={emailAlertCooldownMs}
              />
            </div>
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function SettingInput({
  id,
  inputMode = 'numeric',
  label,
  onChange,
  placeholder,
  value,
}: {
  id: string;
  inputMode?: 'email' | 'numeric';
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}
