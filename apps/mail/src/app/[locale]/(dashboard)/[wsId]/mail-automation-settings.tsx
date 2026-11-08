'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type MailMailbox,
  type MailMailboxSettings,
  updateMailMailboxSettings,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionFooter,
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
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useMailBootstrap } from './use-mail-bootstrap';

export function MailAutomationSettings({
  mailbox,
  settings,
  workspaceId,
}: {
  mailbox: MailMailbox;
  settings: MailMailboxSettings;
  workspaceId: string;
}) {
  const t = useTranslations('mail');
  const client = useQueryClient();
  const initial = settings.automation ?? {
    forwarding: { mode: 'off' as const },
    smartLabelsEnabled: false,
  };
  const [automation, setAutomation] = useState(initial);
  const canManage = ['owner', 'admin'].includes(mailbox.role);
  const bootstrap = useMailBootstrap(workspaceId);
  const candidates = (bootstrap.data?.mailboxes ?? []).filter(
    (candidate) =>
      candidate.id !== mailbox.id &&
      candidate.domainId === mailbox.domainId &&
      candidate.status === 'active' &&
      !candidate.groupPolicy
  );
  const save = useMutation({
    mutationFn: () =>
      updateMailMailboxSettings(workspaceId, mailbox.id, { automation }),
    onError: () => toast.error(t('settings_save_failed')),
    onSuccess: async () => {
      toast.success(t('settings_saved'));
      await client.invalidateQueries({ queryKey: ['mail', workspaceId] });
    },
  });
  const selection =
    automation.forwarding.mode === 'mailbox'
      ? automation.forwarding.address
      : automation.forwarding.mode;
  return (
    <SettingsSection
      title={t('smart_inbox')}
      description={t('smart_inbox_description')}
    >
      <SettingItemTab
        title={
          <Label htmlFor="mail-smart-labels">{t('automatic_labels')}</Label>
        }
      >
        <Switch
          id="mail-smart-labels"
          disabled={!canManage}
          checked={automation.smartLabelsEnabled}
          onCheckedChange={(smartLabelsEnabled) =>
            setAutomation({ ...automation, smartLabelsEnabled })
          }
        />
      </SettingItemTab>
      {!mailbox.groupPolicy && (
        <SettingItemTab
          title={
            <Label htmlFor="mail-forwarding">{t('automatic_forwarding')}</Label>
          }
          description={t('forwarding_description')}
          controlWidth="md"
        >
          <Select
            disabled={!canManage}
            value={selection}
            onValueChange={(value) => {
              if (!value) return;
              setAutomation({
                ...automation,
                forwarding:
                  value === 'off' || value === 'catch_all'
                    ? { mode: value }
                    : { mode: 'mailbox', address: value },
              });
            }}
          >
            <SelectTrigger id="mail-forwarding" className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">{t('forwarding_off')}</SelectItem>
              <SelectItem value="catch_all">
                {t('forwarding_catch_all')}
              </SelectItem>
              {candidates.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.address}>
                  {candidate.address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItemTab>
      )}
      {canManage && (
        <SettingsSectionFooter>
          <Button
            disabled={
              save.isPending ||
              JSON.stringify(initial) === JSON.stringify(automation)
            }
            onClick={() => save.mutate()}
          >
            {t('save')}
          </Button>
        </SettingsSectionFooter>
      )}
    </SettingsSection>
  );
}
