'use client';

import { ShieldAlert, ShieldCheck } from '@tuturuuu/icons';
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
import { useTranslations } from 'next-intl';

export interface TaskMediaPermissionAccess {
  effectivePermissions: string[];
  hasPermission: boolean;
  membershipType: string;
  permission: 'manage_drive_tasks_directory';
  roles: Array<{
    id: string;
    name: string;
  }>;
}

interface TaskMediaPermissionDialogProps {
  access: TaskMediaPermissionAccess | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function membershipLabel(
  membershipType: string,
  t: ReturnType<typeof useTranslations>
) {
  if (membershipType === 'MEMBER') return t('membership_member');
  if (membershipType === 'GUEST') return t('membership_guest');
  return membershipType;
}

export function TaskMediaPermissionDialog({
  access,
  onOpenChange,
  open,
}: TaskMediaPermissionDialogProps) {
  const t = useTranslations('ws-task-boards.dialog.task_media_permission');
  const hasAdminAccess = access?.effectivePermissions.includes('admin');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg border bg-muted p-2">
              {access?.hasPermission ? (
                <ShieldCheck className="size-5 text-dynamic-green" />
              ) : (
                <ShieldAlert className="size-5 text-dynamic-yellow" />
              )}
            </div>
            <div className="space-y-1">
              <DialogTitle>{t('title')}</DialogTitle>
              <DialogDescription>{t('description')}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {access ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('access_status')}
                </p>
                <Badge variant={access.hasPermission ? 'success' : 'warning'}>
                  {access.hasPermission ? t('granted') : t('not_granted')}
                </Badge>
              </div>
              <div className="space-y-1.5">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('membership')}
                </p>
                <p className="font-medium text-sm">
                  {membershipLabel(access.membershipType, t)}
                </p>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border p-4">
              <p className="font-medium text-sm">{t('required_permission')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{t('permission_name')}</Badge>
                <code className="rounded bg-muted px-2 py-1 text-xs">
                  {access.permission}
                </code>
                {hasAdminAccess && (
                  <Badge variant="secondary">{t('administrator_access')}</Badge>
                )}
              </div>
              <p className="text-muted-foreground text-sm">
                {t('permission_description')}
              </p>
            </div>

            <div className="space-y-2 rounded-lg border p-4">
              <p className="font-medium text-sm">{t('current_roles')}</p>
              {access.roles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {access.roles.map((role) => (
                    <Badge key={role.id} variant="secondary">
                      {role.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">{t('no_roles')}</p>
              )}
            </div>

            <p className="rounded-lg bg-muted p-3 text-muted-foreground text-sm">
              {access.hasPermission ? t('granted_help') : t('denied_help')}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border p-4 text-muted-foreground text-sm">
            {t('details_unavailable')}
          </div>
        )}

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
