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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { parseInviteEmails } from './member-filter-utils';
import { WorkspaceAccessInviteAccessPicker } from './workspace-access-invite-access-picker';
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-b-none p-0 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:translate-x-0 max-sm:translate-y-0 sm:max-h-[min(90dvh,54rem)] sm:max-w-3xl sm:rounded-2xl">
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
          <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)] lg:divide-x">
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
                <div className="space-y-3 rounded-xl border border-dynamic-blue/25 bg-dynamic-blue/5 p-3.5 sm:p-4">
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
                      <span>
                        {t('ws-members.pos_operator_only_permission')}
                      </span>
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
            </section>
          </div>
        </div>

        <DialogFooter className="grid shrink-0 grid-cols-[auto_1fr] items-center gap-3 border-t bg-muted/20 p-3 sm:flex sm:p-4">
          <div className="min-w-0">
            <p className="font-medium text-sm">
              {t('ws-members.recipients_count', { count })}
            </p>
            <p className="truncate text-muted-foreground text-xs">
              {accessPreset === 'member'
                ? `${t('ws-members.invite_membership_member')} · ${t('ws-members.roles_selected', { count: roleIds.length })}`
                : t(`ws-members.invite_membership_${accessPreset}`)}
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
