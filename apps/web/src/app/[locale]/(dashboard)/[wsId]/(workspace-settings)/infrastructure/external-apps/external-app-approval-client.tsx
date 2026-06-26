'use client';

import { useMutation } from '@tanstack/react-query';
import { CheckCircle, Loader2, ShieldAlert } from '@tuturuuu/icons';
import {
  type ExternalAppRegistration,
  saveExternalApp,
} from '@tuturuuu/internal-api/infrastructure/apps';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { buildExternalAppApprovalPayload } from './approval-utils';

export function ExternalAppApprovalClient({
  app,
  invalidScopes,
  requestedScopes,
  returnUrl,
}: {
  app: ExternalAppRegistration | null;
  invalidScopes: string[];
  requestedScopes: string[];
  returnUrl: string | null;
}) {
  const t = useTranslations('external-apps-settings');
  const [approved, setApproved] = useState(false);
  const approval = useMemo(
    () => (app ? buildExternalAppApprovalPayload(app, requestedScopes) : null),
    [app, requestedScopes]
  );
  const mutation = useMutation({
    mutationFn: () => {
      if (!approval) throw new Error(t('approval.missing_app'));
      return saveExternalApp(approval.payload);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('messages.save_error')
      ),
    onSuccess: () => {
      setApproved(true);
      toast.success(t('approval.success'));
      if (returnUrl) window.location.assign(returnUrl);
    },
  });

  if (!app) {
    return (
      <ApprovalShell
        description={t('approval.missing_app')}
        icon={<ShieldAlert className="h-5 w-5" />}
        title={t('approval.title')}
      />
    );
  }

  const missingScopes = approval?.missingScopes ?? [];
  const approvedScopes = approval?.approvedScopes ?? [];
  const canApprove = invalidScopes.length === 0 && missingScopes.length > 0;

  return (
    <ApprovalShell
      description={t('approval.description', { app: app.displayName })}
      icon={<ShieldAlert className="h-5 w-5" />}
      title={t('approval.title')}
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="font-semibold text-base">{app.displayName}</div>
          <div className="mt-1 font-mono text-muted-foreground text-sm">
            {app.id}
          </div>
        </div>

        <ScopeGroup
          label={t('approval.requested_scopes')}
          scopes={requestedScopes}
        />
        <ScopeGroup
          label={t('approval.already_allowed')}
          scopes={approvedScopes}
        />
        <ScopeGroup
          label={t('approval.missing_scopes')}
          scopes={missingScopes}
          variant="warning"
        />
        {invalidScopes.length > 0 ? (
          <ScopeGroup
            label={t('approval.invalid_scopes')}
            scopes={invalidScopes}
            variant="destructive"
          />
        ) : null}

        {approved || missingScopes.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-dynamic-green/30 bg-dynamic-green/10 p-3 text-dynamic-green">
            <CheckCircle className="h-4 w-4" />
            <span className="font-medium text-sm">
              {approved
                ? t('approval.approved')
                : t('approval.no_missing_scopes')}
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          {canApprove ? (
            <Button
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
              type="button"
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              {t('actions.approve_scopes')}
            </Button>
          ) : null}
          {returnUrl ? (
            <Button asChild type="button" variant="secondary">
              <a href={returnUrl}>{t('approval.return')}</a>
            </Button>
          ) : null}
        </div>
      </div>
    </ApprovalShell>
  );
}

function ApprovalShell({
  children,
  description,
  icon,
  title,
}: {
  children?: ReactNode;
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-5 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-lg">{title}</h2>
          <p className="mt-1 text-muted-foreground text-sm">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ScopeGroup({
  label,
  scopes,
  variant = 'secondary',
}: {
  label: string;
  scopes: string[];
  variant?: 'destructive' | 'secondary' | 'warning';
}) {
  if (scopes.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="font-medium text-muted-foreground text-sm">{label}</div>
      <div className="flex flex-wrap gap-2">
        {scopes.map((scope) => (
          <Badge key={scope} variant={variant}>
            {scope}
          </Badge>
        ))}
      </div>
    </div>
  );
}
