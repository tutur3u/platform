'use client';

import { useQuery } from '@tanstack/react-query';
import { RotateCcw, ShieldCheck } from '@tuturuuu/icons';
import { readPrivateMiraPolicy } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  SettingsSection,
  SettingsSectionBlock,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useFormatter, useTranslations } from 'next-intl';
import { SettingsField } from '../../../../ui/src/components/ui/custom/settings-field';
import { SettingItemTab } from '../../../../ui/src/components/ui/custom/settings-item-tab';
import { MiraAdultNotice } from './mira-adult-notice';
import { useMiraAudience, useSetMiraAudience } from './use-mira-audience';

/**
 * Meeting settings section for the workspace 18+ declaration that turns Mira
 * on. People who may change it get one switch. Everyone else sees the current
 * state, as far as the meeting reveals it, and who can change it.
 */
export function MiraAudienceSettings({
  wsId,
  meetingId,
}: {
  wsId: string;
  meetingId: string;
}) {
  const t = useTranslations('meet.mira_adults');
  const format = useFormatter();
  const audience = useMiraAudience(wsId);
  const save = useSetMiraAudience(wsId, () => toast.error(t('save_failed')));
  // The setting is hidden from people who cannot manage it. Their own Private
  // Mira policy still says whether the workspace has declared 18+.
  const policy = useQuery({
    queryKey: ['mira-audience-effective', meetingId],
    queryFn: () => readPrivateMiraPolicy(meetingId),
    enabled: audience.readOnly && audience.attested === undefined,
    retry: false,
  });
  const on =
    audience.attested ??
    (policy.data?.available
      ? true
      : policy.data?.unavailableReason === 'workspace'
        ? false
        : undefined);

  if (audience.failed)
    return (
      <SettingsSection>
        <SettingsSectionMessage
          tone="error"
          action={
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-full"
              onClick={audience.retry}
            >
              <RotateCcw className="size-4" />
              {t('retry')}
            </Button>
          }
        >
          {t('load_failed')}
        </SettingsSectionMessage>
      </SettingsSection>
    );

  const icon = <ShieldCheck className="size-4" />;
  const description = (
    <>
      {t('effect')}
      {audience.attested && audience.attestedAt && (
        <span className="mt-1 block text-xs">
          {t('confirmed_at', {
            date: format.dateTime(new Date(audience.attestedAt), {
              dateStyle: 'medium',
            }),
          })}
        </span>
      )}
    </>
  );
  return (
    <SettingsSection>
      <SettingsSectionBlock>
        <MiraAdultNotice />
      </SettingsSectionBlock>
      {audience.canManage ? (
        <SettingsField
          icon={icon}
          label={t('toggle')}
          description={description}
          layout="compact"
        >
          {(field) => (
            // The label widens the switch to a 44px target without moving it.
            <Label
              htmlFor={field.id}
              className="-my-3 flex min-h-11 min-w-11 cursor-pointer items-center justify-end"
            >
              <Switch
                {...field}
                checked={on === true}
                disabled={save.isPending}
                onCheckedChange={(next) => save.mutate(next)}
              />
            </Label>
          )}
        </SettingsField>
      ) : (
        <SettingItemTab
          icon={icon}
          title={t('toggle')}
          description={description}
          layout="compact"
        >
          {on !== undefined && (
            <Badge
              variant={on ? 'success' : 'outline'}
              className="rounded-full"
            >
              {t(on ? 'state_on' : 'state_off')}
            </Badge>
          )}
        </SettingItemTab>
      )}
      {audience.canManage && (
        <SettingsSectionBlock className="text-muted-foreground text-sm">
          {t('responsibility')}
        </SettingsSectionBlock>
      )}
      {audience.readOnly && (
        <SettingsSectionBlock className="text-muted-foreground text-sm">
          <p role={audience.ownerOnly ? 'alert' : undefined}>
            {t('owner_only')}
          </p>
        </SettingsSectionBlock>
      )}
    </SettingsSection>
  );
}
