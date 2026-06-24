'use client';

import { Cable } from '@tuturuuu/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { SensitiveSecretField } from './channel-secret-field';
import { ChannelStatus } from './channel-status';
import { ToggleField } from './channel-toggle-field';
import type { Channel } from './channel-types';
import { ZaloPersonalActions } from './zalo-personal-actions';

export function ZaloChannelFields({
  agentId,
  channel,
  isPending,
  onRefresh,
}: {
  agentId?: string;
  channel?: Channel;
  isPending?: boolean;
  onRefresh?: () => void;
}) {
  const t = useTranslations('ai-agents-settings');
  const [accountMode, setAccountMode] = useState(
    channel?.zaloAccountMode ?? 'official'
  );
  const accountModeTriggerId = agentId
    ? `${agentId}-zaloAccountMode`
    : 'new-zaloAccountMode';

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <Cable className="h-4 w-4 text-primary" />
          {t('channels.zalo')}
        </div>
        {channel ? <ChannelStatus channel={channel} /> : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          defaultValue={channel?.displayName ?? 'Zalo'}
          name="zaloDisplayName"
          placeholder={t('fields.display_name')}
        />
        <div className="space-y-2">
          <Label htmlFor={accountModeTriggerId}>
            {t('fields.zalo_account_mode')}
          </Label>
          <Select
            defaultValue={accountMode}
            name="zaloAccountMode"
            onValueChange={(value) =>
              setAccountMode(value === 'personal' ? 'personal' : 'official')
            }
          >
            <SelectTrigger id={accountModeTriggerId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="official">
                {t('fields.zalo_mode_official')}
              </SelectItem>
              <SelectItem value="personal">
                {t('fields.zalo_mode_personal')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input
          defaultValue={channel?.externalChannelId ?? ''}
          name="zaloExternalChannelId"
          placeholder={t('fields.external_channel_id')}
        />
        {accountMode === 'official' ? (
          <>
            <Input
              defaultValue={channel?.zaloOfficialAccountId ?? ''}
              name="zaloOfficialAccountId"
              placeholder={t('fields.zalo_oa_id')}
            />
            <div className="md:col-span-2">
              <SensitiveSecretField
                channel={channel}
                label={t('fields.zalo_bot_token')}
                name="zaloBotToken"
                secretName="botToken"
              />
            </div>
            <div className="md:col-span-2">
              <SensitiveSecretField
                channel={channel}
                label={t('fields.zalo_webhook_secret')}
                name="zaloWebhookSecret"
                secretName="webhookSecret"
              />
            </div>
          </>
        ) : (
          <>
            <div className="rounded-md border border-dynamic-yellow/30 bg-dynamic-yellow/10 p-3 text-dynamic-yellow text-sm md:col-span-2">
              {t('zalo_personal.experimental_notice')}
            </div>
            <Input
              className="font-mono"
              defaultValue={channel?.zaloPersonalOwnId ?? ''}
              name="zaloPersonalOwnId"
              placeholder={t('fields.zalo_personal_own_id')}
              readOnly
            />
            <div />
            <div className="md:col-span-2">
              <SensitiveSecretField
                channel={channel}
                label={t('fields.zalo_personal_cookie_json')}
                name="zaloPersonalCookieJson"
                secretName="personalCookieJson"
              />
            </div>
            <SensitiveSecretField
              channel={channel}
              label={t('fields.zalo_personal_imei')}
              name="zaloPersonalImei"
              secretName="personalImei"
            />
            <SensitiveSecretField
              channel={channel}
              label={t('fields.zalo_personal_user_agent')}
              name="zaloPersonalUserAgent"
              secretName="personalUserAgent"
            />
          </>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <ToggleField
          defaultChecked={channel?.enabled ?? true}
          id={agentId ? `${agentId}-zaloEnabled` : 'new-zaloEnabled'}
          label={t('fields.channel_enabled')}
          name="zaloEnabled"
        />
        <ToggleField
          defaultChecked={channel?.autoRespond ?? true}
          id={agentId ? `${agentId}-zaloAutoRespond` : 'new-zaloAutoRespond'}
          label={t('fields.auto_respond')}
          name="zaloAutoRespond"
        />
        <ToggleField
          defaultChecked={channel?.historySyncEnabled ?? true}
          id={
            agentId
              ? `${agentId}-zaloHistorySyncEnabled`
              : 'new-zaloHistorySyncEnabled'
          }
          label={t('fields.history_sync')}
          name="zaloHistorySyncEnabled"
        />
      </div>
      <ZaloPersonalActions
        agentId={agentId}
        channel={channel}
        disabled={isPending}
        onRefresh={onRefresh}
      />
    </div>
  );
}
