'use client';

import { AlertTriangle, Copy } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

export interface FinancePermissionRequestUser {
  displayName?: string | null;
  email?: string | null;
  id: string;
}

interface FinancePermissionWarningContentProps {
  missingPermissions: string[];
  user?: FinancePermissionRequestUser | null;
}

interface FinancePermissionWarningDialogProps
  extends FinancePermissionWarningContentProps {
  defaultOpen?: boolean;
  trigger?: ReactNode;
}

function resolveDisplayName(
  user: FinancePermissionRequestUser | null | undefined,
  fallback: string
) {
  return user?.displayName || user?.email || user?.id || fallback;
}

export function FinancePermissionWarningContent({
  missingPermissions,
  user,
}: FinancePermissionWarningContentProps) {
  const t = useTranslations();
  const fallbackUser = t('finance-permission-warning.unknown_user');
  const displayName = resolveDisplayName(user, fallbackUser);
  const userId = user?.id || fallbackUser;
  const permissionList = missingPermissions.join(', ');
  const requestText = useMemo(
    () =>
      t('finance-permission-warning.request_template', {
        displayName,
        permissions: permissionList,
        userId,
      }),
    [displayName, permissionList, t, userId]
  );

  const copyRequest = async () => {
    try {
      await navigator.clipboard.writeText(requestText);
      toast.success(t('finance-permission-warning.copy_success'));
    } catch {
      toast.error(t('finance-permission-warning.copy_error'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/5 p-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-orange" />
          <div className="space-y-1">
            <p className="font-medium text-sm">
              {t('finance-permission-warning.summary')}
            </p>
            <p className="text-muted-foreground text-sm">
              {t('finance-permission-warning.description')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border p-3 text-sm">
        <div className="grid gap-1">
          <span className="font-medium text-muted-foreground">
            {t('finance-permission-warning.permissions_to_add')}
          </span>
          <div className="flex flex-wrap gap-2">
            {missingPermissions.map((permission) => (
              <code
                key={permission}
                className="rounded bg-muted px-2 py-1 font-mono text-xs"
              >
                {permission}
              </code>
            ))}
          </div>
        </div>

        <div className="grid gap-1">
          <span className="font-medium text-muted-foreground">
            {t('finance-permission-warning.user_id')}
          </span>
          <code className="break-all rounded bg-muted px-2 py-1 font-mono text-xs">
            {userId}
          </code>
        </div>

        <div className="grid gap-1">
          <span className="font-medium text-muted-foreground">
            {t('finance-permission-warning.display_name')}
          </span>
          <span>{displayName}</span>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={copyRequest}>
          <Copy className="mr-2 h-4 w-4" />
          {t('finance-permission-warning.copy_request')}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function FinancePermissionWarningDialog({
  defaultOpen = false,
  missingPermissions,
  trigger,
  user,
}: FinancePermissionWarningDialogProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('finance-permission-warning.title')}</DialogTitle>
          <DialogDescription>
            {t('finance-permission-warning.dialog_description')}
          </DialogDescription>
        </DialogHeader>
        <FinancePermissionWarningContent
          missingPermissions={missingPermissions}
          user={user}
        />
      </DialogContent>
    </Dialog>
  );
}
