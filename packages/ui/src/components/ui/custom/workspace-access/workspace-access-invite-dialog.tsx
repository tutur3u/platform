'use client';

import { MailPlus, UserPlus } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { parseInviteEmails } from './member-filter-utils';
import { WorkspaceAccessInviteAccessPicker } from './workspace-access-invite-access-picker';
import { WorkspaceAccessInvitePosPanel } from './workspace-access-invite-pos-panel';
import { WorkspaceAccessInviteRolePicker } from './workspace-access-invite-role-picker';

type Props = {
  accessPreset: 'guest' | 'member' | 'pos_operator';
  canManageRoles: boolean;
  confirmDefaultAdminMigration: boolean;
  defaultAdminEnabled: boolean;
  emails: string;
  isSubmitting: boolean;
  joinedMemberCount: number;
  noRoleLabel: string;
  onAccessPresetChange: (value: 'guest' | 'member' | 'pos_operator') => void;
  onConfirmDefaultAdminMigrationChange: (value: boolean) => void;
  onEmailsChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onRoleIdsChange: (roleIds: string[]) => void;
  onSubmit: () => void;
  open: boolean;
  roleIds: string[];
  roles: Array<{ id: string; name: string }>;
};

export function WorkspaceAccessInviteDialog({
  accessPreset,
  canManageRoles,
  confirmDefaultAdminMigration,
  defaultAdminEnabled,
  emails,
  isSubmitting,
  joinedMemberCount,
  noRoleLabel,
  onAccessPresetChange,
  onConfirmDefaultAdminMigrationChange,
  onEmailsChange,
  onOpenChange,
  onRoleIdsChange,
  onSubmit,
  open,
  roleIds,
  roles,
}: Props) {
  const t = useTranslations();
  const count = parseInviteEmails(emails).length;
  const selectedRoleNames = roles
    .filter((role) => roleIds.includes(role.id))
    .map((role) => role.name);
  const accessSummary =
    accessPreset === 'member'
      ? selectedRoleNames.length > 0
        ? `${t('ws-members.invite_access_member_tab')} · ${selectedRoleNames.join(', ')}`
        : `${t('ws-members.invite_access_member_tab')} · ${t('ws-members.no_roles_assigned')}`
      : t(`ws-members.invite_membership_${accessPreset}`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-b-none p-0 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:translate-x-0 max-sm:translate-y-0 sm:max-h-[min(90dvh,54rem)] sm:max-w-4xl sm:rounded-2xl">
        <DialogHeader className="shrink-0 gap-0 border-b p-4 pr-12 text-left sm:p-6 sm:pr-12">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-dynamic-blue/25 bg-dynamic-blue/10 text-dynamic-blue">
              <UserPlus className="size-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle>{t('ws-members.invite_member')}</DialogTitle>
              <DialogDescription className="leading-5">
                {t('ws-members.invite_dialog_description')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(22rem,1fr)] lg:divide-x">
            <section className="space-y-4 p-4 sm:p-6">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-foreground font-semibold text-background text-xs">
                  1
                </span>
                <h3 className="font-semibold text-sm">
                  {t('ws-members.invite_recipients_title')}
                </h3>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="workspace-access-invite-emails">
                  {t('ws-members.invite_emails_label')}
                </Label>
                <Textarea
                  id="workspace-access-invite-emails"
                  rows={7}
                  value={emails}
                  onChange={(event) => onEmailsChange(event.target.value)}
                  placeholder={'one@example.com\ntwo@example.com'}
                  className="min-h-40 resize-y rounded-xl bg-muted/20 font-mono text-sm leading-6"
                />
                <div className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
                  <span>{t('ws-members.invite_emails_helper')}</span>
                  <Badge variant="outline" className="rounded-full">
                    {t('ws-members.recipients_count', { count })}
                  </Badge>
                </div>
              </div>
            </section>

            <section className="space-y-5 bg-muted/10 p-4 sm:p-6">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-foreground font-semibold text-background text-xs">
                  2
                </span>
                <h3 className="font-semibold text-sm">
                  {t('ws-members.invite_access_title')}
                </h3>
              </div>

              <WorkspaceAccessInviteAccessPicker
                canManageRoles={canManageRoles}
                onChange={onAccessPresetChange}
                value={accessPreset}
              />

              {canManageRoles && accessPreset === 'member' ? (
                <WorkspaceAccessInviteRolePicker
                  noRoleLabel={noRoleLabel}
                  onChange={onRoleIdsChange}
                  roleIds={roleIds}
                  roles={roles}
                />
              ) : null}

              {accessPreset === 'pos_operator' ? (
                <WorkspaceAccessInvitePosPanel
                  confirmDefaultAdminMigration={confirmDefaultAdminMigration}
                  defaultAdminEnabled={defaultAdminEnabled}
                  joinedMemberCount={joinedMemberCount}
                  onConfirmDefaultAdminMigrationChange={
                    onConfirmDefaultAdminMigrationChange
                  }
                />
              ) : null}
            </section>
          </div>
        </div>

        <DialogFooter className="grid shrink-0 grid-cols-[auto_1fr] items-center gap-3 border-t bg-muted/20 p-3 sm:flex sm:p-4">
          <div className="min-w-0">
            <p className="font-medium text-sm">
              {t('ws-members.recipients_count', { count })}
            </p>
            <p
              className="truncate text-muted-foreground text-xs"
              title={accessSummary}
            >
              {accessSummary}
            </p>
          </div>
          <Button
            className="min-w-0"
            disabled={
              isSubmitting ||
              count === 0 ||
              (accessPreset === 'pos_operator' &&
                (!canManageRoles || !confirmDefaultAdminMigration))
            }
            onClick={onSubmit}
          >
            <MailPlus className="mr-2 size-4" />
            <span className="truncate">{t('ws-members.invite_submit')}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
