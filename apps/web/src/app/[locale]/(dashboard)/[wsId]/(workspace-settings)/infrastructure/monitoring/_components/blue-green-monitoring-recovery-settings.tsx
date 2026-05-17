'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, ServerCog } from '@tuturuuu/icons';
import {
  type BlueGreenMonitoringSnapshot,
  updateBlueGreenDockerRecoverySettings,
} from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

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
      return updateBlueGreenDockerRecoverySettings({
        dockerRecoveryPollMs: parseRequiredPositiveInteger(
          dockerRecoveryPollMs,
          settings.dockerRecoveryPollMs
        ),
        dockerRecoveryTimeoutMs: parseOptionalPositiveInteger(
          dockerRecoveryTimeoutMs
        ),
        dockerRestartAfterMs:
          parseOptionalPositiveInteger(dockerRestartAfterMs),
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
      });
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
    <section className="rounded-lg border border-border/60 bg-background p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
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

        <Button
          disabled={mutation.isPending}
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

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
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
            placeholder={t('recovery_settings.email_recipients_placeholder')}
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
    </section>
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
