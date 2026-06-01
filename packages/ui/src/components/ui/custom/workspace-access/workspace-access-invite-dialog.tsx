'use client';

import { MailPlus, UserPlus } from '@tuturuuu/icons';
import type { WorkspaceDefaultPermissionMemberType } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { parseInviteEmails } from './member-filter-utils';

type Props = {
  emails: string;
  isSubmitting: boolean;
  memberType: WorkspaceDefaultPermissionMemberType;
  onEmailsChange: (value: string) => void;
  onMemberTypeChange: (value: WorkspaceDefaultPermissionMemberType) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  open: boolean;
};

export function WorkspaceAccessInviteDialog({
  emails,
  isSubmitting,
  memberType,
  onEmailsChange,
  onMemberTypeChange,
  onOpenChange,
  onSubmit,
  open,
}: Props) {
  const t = useTranslations() as (key: string) => string;
  const count = parseInviteEmails(emails).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader className="space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted/50">
            <UserPlus className="h-4 w-4" />
          </div>
          <DialogTitle>{t('ws-members.invite_member')}</DialogTitle>
          <DialogDescription>
            {t('ws-members.invite_dialog_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            rows={7}
            value={emails}
            onChange={(event) => onEmailsChange(event.target.value)}
            placeholder={'one@example.com\ntwo@example.com'}
          />

          <Select
            value={memberType}
            onValueChange={(value) =>
              onMemberTypeChange(value as WorkspaceDefaultPermissionMemberType)
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MEMBER">
                {t('ws-members.invite_membership_member')}
              </SelectItem>
              <SelectItem value="GUEST">
                {t('ws-members.invite_membership_guest')}
              </SelectItem>
            </SelectContent>
          </Select>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="secondary" className="rounded-full">
              {count} {t('ws-members.pending_invitations').toLowerCase()}
            </Badge>
            <Button disabled={isSubmitting || count === 0} onClick={onSubmit}>
              <MailPlus className="mr-2 h-4 w-4" />
              {t('ws-members.invite_submit')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
