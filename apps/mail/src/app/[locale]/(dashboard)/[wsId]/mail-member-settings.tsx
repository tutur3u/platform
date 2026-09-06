'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type MailMailboxMember,
  type MailMailboxRole,
  removeMailMailboxMember,
  upsertMailMailboxMember,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
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

export function MailMemberSettings({
  mailboxId,
  workspaceId,
  members,
  canManage,
}: {
  mailboxId: string;
  workspaceId: string;
  members: MailMailboxMember[];
  canManage: boolean;
}) {
  const t = useTranslations('mail');
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MailMailboxRole>('viewer');
  const [removing, setRemoving] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (
      change:
        | { email?: string; userId?: string; role: MailMailboxRole }
        | { remove: string }
    ) => {
      if ('remove' in change)
        await removeMailMailboxMember(workspaceId, mailboxId, change.remove);
      else await upsertMailMailboxMember(workspaceId, mailboxId, change);
    },
    onSuccess: async () => {
      setEmail('');
      setRemoving(null);
      toast.success(t('settings_saved'));
      await client.invalidateQueries({ queryKey: ['mail', workspaceId] });
    },
    onError: () => toast.error(t('settings_save_failed')),
  });
  const options = ['viewer', 'sender', 'admin'] as const;
  return (
    <section className="space-y-4">
      {canManage ? (
        <form
          className="space-y-3 rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ email: email.trim(), role });
          }}
        >
          <Label htmlFor="member-email">{t('group_member_email')}</Label>
          <Input
            id="member-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Select
            value={role}
            onValueChange={(next) => setRole(next as MailMailboxRole)}
          >
            <SelectTrigger aria-label={t('group_member_role')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((item) => (
                <SelectItem value={item} key={item}>
                  {t(`group_role_${item}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={save.isPending || !email.trim()}>
            {t('group_add_member')}
          </Button>
        </form>
      ) : null}
      <div className="divide-y overflow-hidden rounded-lg border">
        {members.map((member) => (
          <div
            className="flex flex-wrap items-center gap-3 p-4"
            key={member.userId}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm">
                {member.fullName || member.email}
              </p>
              <p className="truncate text-muted-foreground text-xs">
                {member.email}
              </p>
            </div>
            {canManage && member.role !== 'owner' ? (
              <>
                <Select
                  value={member.role}
                  disabled={save.isPending}
                  onValueChange={(next) =>
                    save.mutate({
                      userId: member.userId,
                      role: next as MailMailboxRole,
                    })
                  }
                >
                  <SelectTrigger
                    className="w-40"
                    aria-label={t('group_member_role')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((item) => (
                      <SelectItem value={item} key={item}>
                        {t(`group_role_${item}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  disabled={save.isPending}
                  onClick={() => setRemoving(member.userId)}
                >
                  {t('group_remove_member')}
                </Button>
                {removing === member.userId ? (
                  <div className="flex w-full items-center gap-2 rounded-lg border p-3">
                    <p className="flex-1 text-sm">
                      {t('group_remove_confirm')}
                    </p>
                    <Button variant="outline" onClick={() => setRemoving(null)}>
                      {t('cancel')}
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={save.isPending}
                      onClick={() => save.mutate({ remove: member.userId })}
                    >
                      {t('group_remove_member')}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground text-sm">
                {t(`group_role_${member.role}`)}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
