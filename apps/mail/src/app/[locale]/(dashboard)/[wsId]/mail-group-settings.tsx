'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateMailMailboxSettings } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionFooter,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  DEFAULT_GROUP_POLICY,
  type MailGroupPolicy,
} from '@/lib/mail/groups/policy';
export function MailGroupSettings({
  mailboxId,
  workspaceId,
  policy,
}: {
  mailboxId: string;
  workspaceId: string;
  policy?: MailGroupPolicy | null;
}) {
  const t = useTranslations('mail');
  const client = useQueryClient();
  const [value, setValue] = useState(policy ?? DEFAULT_GROUP_POLICY);
  const save = useMutation({
    mutationFn: () =>
      updateMailMailboxSettings(workspaceId, mailboxId, { groupPolicy: value }),
    onSuccess: async () => {
      toast.success(t('settings_saved'));
      await client.invalidateQueries({ queryKey: ['mail', workspaceId] });
    },
    onError: () => toast.error(t('settings_save_failed')),
  });
  return (
    <SettingsSection
      title={t('group_delivery_title')}
      description={t('group_delivery_description')}
    >
      {(['posting', 'attachments', 'sendAs'] as const).map((field) => (
        <SettingItemTab
          key={field}
          title={
            <Label htmlFor={`group-${field}`}>
              {t(`group_policy_${field}`)}
            </Label>
          }
          controlWidth="sm"
        >
          <Select
            value={value[field]}
            onValueChange={(next) => setValue({ ...value, [field]: next })}
          >
            <SelectTrigger id={`group-${field}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(field === 'sendAs'
                ? ['managers', 'members']
                : ['managers', 'members', 'organization', 'anyone']
              ).map((scope) => (
                <SelectItem key={scope} value={scope}>
                  {t(`group_scope_${scope}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItemTab>
      ))}
      <SettingsSectionMessage className="py-3">
        {t('group_authentication_notice')}
      </SettingsSectionMessage>
      <SettingsSectionFooter>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {t('save')}
        </Button>
      </SettingsSectionFooter>
    </SettingsSection>
  );
}
