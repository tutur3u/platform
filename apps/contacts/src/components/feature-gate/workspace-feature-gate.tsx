'use client';

import { useMutation } from '@tanstack/react-query';
import { Loader2, RefreshCw, ShieldAlert, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export type WorkspaceFeatureGateTone = 'brand' | 'muted' | 'warning';

const TONE_CLASSNAMES: Record<WorkspaceFeatureGateTone, string> = {
  brand: 'border-dynamic-purple/25 bg-dynamic-purple/10 text-dynamic-purple',
  muted: 'border-border bg-muted text-muted-foreground',
  warning: 'border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange',
};

export interface WorkspaceFeatureHighlight {
  description: string;
  icon: ReactNode;
  title: string;
}

export function WorkspaceFeatureGateShell({
  action,
  description,
  highlights,
  icon,
  title,
  tone,
}: {
  action?: ReactNode;
  description: string;
  highlights?: WorkspaceFeatureHighlight[];
  icon: ReactNode;
  title: string;
  tone: WorkspaceFeatureGateTone;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-2 md:p-6">
      <Card className="w-full max-w-2xl">
        <CardContent className="flex flex-col items-center gap-6 p-6 text-center md:p-10">
          <div
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-2xl border',
              TONE_CLASSNAMES[tone]
            )}
          >
            {icon}
          </div>

          <div className="space-y-2">
            <h2 className="font-semibold text-2xl tracking-tight">{title}</h2>
            <p className="mx-auto max-w-lg text-balance text-muted-foreground text-sm">
              {description}
            </p>
          </div>

          {highlights?.length ? (
            <ul className="grid w-full gap-3 text-left sm:grid-cols-3">
              {highlights.map((highlight) => (
                <li
                  className="rounded-lg border bg-muted/40 p-3"
                  key={highlight.title}
                >
                  <span className="flex items-center gap-2 font-medium text-sm">
                    {highlight.icon}
                    {highlight.title}
                  </span>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {highlight.description}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}

          {action}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * "This module is switched off" with a one-click enable for anyone allowed to
 * flip it, and an explanation of who to ask for everyone else.
 */
export function WorkspaceFeatureDisabledGate({
  canEnable,
  description,
  enableLabel,
  errorMessage,
  highlights,
  icon,
  memberDescription,
  onEnable,
  successMessage,
  title,
}: {
  canEnable: boolean;
  description: string;
  enableLabel: string;
  errorMessage: string;
  highlights?: WorkspaceFeatureHighlight[];
  icon: ReactNode;
  memberDescription: string;
  onEnable: () => Promise<unknown>;
  successMessage: string;
  title: string;
}) {
  const router = useRouter();

  const enableMutation = useMutation({
    mutationFn: onEnable,
    onSuccess: () => {
      toast.success(successMessage);
      router.refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : errorMessage);
    },
  });

  return (
    <WorkspaceFeatureGateShell
      action={
        canEnable ? (
          <Button
            disabled={enableMutation.isPending}
            onClick={() => enableMutation.mutate()}
            size="lg"
          >
            {enableMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {enableLabel}
          </Button>
        ) : null
      }
      description={canEnable ? description : memberDescription}
      highlights={highlights}
      icon={icon}
      title={title}
      tone="brand"
    />
  );
}

export function WorkspaceFeatureForbiddenGate({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <WorkspaceFeatureGateShell
      description={description}
      icon={<ShieldAlert className="h-7 w-7" />}
      title={title}
      tone="muted"
    />
  );
}

export function WorkspaceFeatureUnavailableGate({
  description,
  icon,
  title,
  tone = 'warning',
}: {
  description: string;
  icon: ReactNode;
  title: string;
  tone?: WorkspaceFeatureGateTone;
}) {
  const t = useTranslations('workspace-feature-gate');
  const router = useRouter();

  return (
    <WorkspaceFeatureGateShell
      action={
        <Button onClick={() => router.refresh()} variant="outline">
          <RefreshCw className="h-4 w-4" />
          {t('retry')}
        </Button>
      }
      description={description}
      icon={icon}
      title={title}
      tone={tone}
    />
  );
}

/** Informational dead end: no retry, no enable, just an explanation. */
export function WorkspaceFeatureNoticeGate({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <WorkspaceFeatureGateShell
      description={description}
      icon={icon}
      title={title}
      tone="muted"
    />
  );
}
