'use client';

import { RotateCcw, ShieldCheck } from '@tuturuuu/icons';
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
import { MiraConsentDefaultField } from './mira-consent-default-field';
import { useMiraAudience, useSetMiraAudience } from './use-mira-audience';

export function MiraAudienceSettings({ wsId }: { wsId: string }) {
  const t = useTranslations('meet.mira_adults');
  const format = useFormatter();
  const audience = useMiraAudience(wsId);
  const save = useSetMiraAudience(wsId, () => toast.error(t('save_failed')));
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
      {audience.setting?.attested && audience.setting.attestedAt && (
        <span className="mt-1 block text-xs">
          {t('confirmed_at', {
            date: format.dateTime(new Date(audience.setting.attestedAt), {
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
      {audience.setting ? (
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
                checked={
                  save.isPending ? save.variables : audience.setting?.attested
                }
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
        />
      )}
      {audience.setting && <MiraConsentDefaultField wsId={wsId} />}
      {audience.setting && (
        <SettingsSectionBlock className="text-muted-foreground text-sm">
          {t('responsibility')}
        </SettingsSectionBlock>
      )}
      {audience.readOnly && (
        <SettingsSectionBlock className="text-muted-foreground text-sm">
          {t('owner_only')}
        </SettingsSectionBlock>
      )}
    </SettingsSection>
  );
}
