'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateMailMailboxSettings } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
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
    <section className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="font-medium">{t('group_delivery_title')}</h3>
        <p className="mt-1 text-muted-foreground text-sm">
          {t('group_delivery_description')}
        </p>
      </div>
      {(['posting', 'attachments', 'sendAs'] as const).map((field) => (
        <div className="space-y-2" key={field}>
          <Label htmlFor={`group-${field}`}>{t(`group_policy_${field}`)}</Label>
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
        </div>
      ))}
      <p className="text-muted-foreground text-sm">
        {t('group_authentication_notice')}
      </p>
      <Button disabled={save.isPending} onClick={() => save.mutate()}>
        {t('save')}
      </Button>
    </section>
  );
}
