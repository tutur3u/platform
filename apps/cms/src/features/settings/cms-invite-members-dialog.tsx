'use client';

import { MailPlus, UserPlus } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';

export function CmsInviteMembersDialog({
  inviteCount,
  inviteEmails,
  isSubmitting,
  onInviteEmailsChange,
  onOpenChange,
  onSubmit,
  open,
}: {
  inviteCount: number;
  inviteEmails: string;
  isSubmitting: boolean;
  onInviteEmailsChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  open: boolean;
}) {
  const t = useTranslations();
  const tSettings = useTranslations('external-projects.settings');

  if (!open) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader className="space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-muted/50">
            <UserPlus className="h-4 w-4 text-foreground" />
          </div>
          <DialogTitle>{t('ws-members.invite_member')}</DialogTitle>
          <DialogDescription>
            {t('ws-members.invite_dialog_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            rows={7}
            value={inviteEmails}
            onChange={(event) => onInviteEmailsChange(event.target.value)}
            placeholder={tSettings('invite_members_placeholder')}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="secondary" className="rounded-full">
              {tSettings('invite_ready', { count: inviteCount })}
            </Badge>
            <Button
              disabled={isSubmitting || inviteCount === 0}
              onClick={onSubmit}
            >
              <MailPlus className="mr-2 h-4 w-4" />
              {t('ws-members.invite_submit')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
