'use client';

import {
  CreditCard,
  MailPlus,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
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
  accessPreset: 'guest' | 'member' | 'pos_operator';
  canManageRoles: boolean;
  confirmDefaultAdminMigration: boolean;
  defaultAdminEnabled: boolean;
  emails: string;
  isSubmitting: boolean;
  joinedMemberCount: number;
  onAccessPresetChange: (value: 'guest' | 'member' | 'pos_operator') => void;
  onConfirmDefaultAdminMigrationChange: (value: boolean) => void;
  onEmailsChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  open: boolean;
};

export function WorkspaceAccessInviteDialog({
  accessPreset,
  canManageRoles,
  confirmDefaultAdminMigration,
  defaultAdminEnabled,
  emails,
  isSubmitting,
  joinedMemberCount,
  onAccessPresetChange,
  onConfirmDefaultAdminMigrationChange,
  onEmailsChange,
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
            value={accessPreset}
            onValueChange={(value) =>
              onAccessPresetChange(value as 'guest' | 'member' | 'pos_operator')
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">
                {t('ws-members.invite_membership_member')}
              </SelectItem>
              <SelectItem value="guest">
                {t('ws-members.invite_membership_guest')}
              </SelectItem>
              <SelectItem value="pos_operator" disabled={!canManageRoles}>
                {t('ws-members.invite_membership_pos_operator')}
              </SelectItem>
            </SelectContent>
          </Select>

          {accessPreset === 'pos_operator' ? (
            <div className="space-y-3 rounded-xl border border-dynamic-blue/25 bg-dynamic-blue/5 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg border border-dynamic-blue/20 bg-background p-2 text-dynamic-blue">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-sm">
                    {t('ws-members.pos_operator_title')}
                  </p>
                  <p className="text-muted-foreground text-sm leading-5">
                    {t('ws-members.pos_operator_description')}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {defaultAdminEnabled ? (
                  <div className="flex items-center gap-2 rounded-lg border bg-background/70 p-3 text-sm">
                    <ShieldCheck className="h-4 w-4 text-dynamic-green" />
                    <span>
                      {joinedMemberCount}{' '}
                      {t('ws-members.pos_operator_existing_members')}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center gap-2 rounded-lg border bg-background/70 p-3 text-sm">
                  <CreditCard className="h-4 w-4 text-dynamic-blue" />
                  <span>{t('ws-members.pos_operator_only_permission')}</span>
                </div>
              </div>

              {defaultAdminEnabled ? (
                <div className="flex items-start gap-2 rounded-lg border border-dynamic-orange/25 bg-dynamic-orange/5 p-3 text-sm">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-orange" />
                  <p className="text-muted-foreground leading-5">
                    {t('ws-members.pos_operator_admin_migration_note')}
                  </p>
                </div>
              ) : null}

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3">
                <Checkbox
                  checked={confirmDefaultAdminMigration}
                  className="mt-0.5"
                  onCheckedChange={(checked) =>
                    onConfirmDefaultAdminMigrationChange(checked === true)
                  }
                />
                <span className="text-sm leading-5">
                  {t('ws-members.pos_operator_confirmation')}
                </span>
              </label>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="secondary" className="rounded-full">
              {count} {t('ws-members.pending_invitations').toLowerCase()}
            </Badge>
            <Button
              disabled={
                isSubmitting ||
                count === 0 ||
                (accessPreset === 'pos_operator' &&
                  (!canManageRoles || !confirmDefaultAdminMigration))
              }
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
