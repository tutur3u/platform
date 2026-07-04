'use client';

import type { LucideIcon } from '@tuturuuu/icons';
import { ArrowRight, PackageOpen } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LoadingRows } from './operator-shell';

export function OperatorMetricCard({
  description,
  icon: Icon,
  label,
  tone = 'default',
  value,
}: {
  description?: ReactNode;
  icon: LucideIcon;
  label: string;
  tone?: 'default' | 'danger' | 'success' | 'warning';
  value: ReactNode;
}) {
  return (
    <article className="grid min-h-28 min-w-0 gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="truncate text-muted-foreground text-sm">{label}</p>
        <span
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/35 text-muted-foreground',
            tone === 'danger' &&
              'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
            tone === 'success' &&
              'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
            tone === 'warning' &&
              'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange'
          )}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-2xl">{value}</p>
        {description ? (
          <p className="mt-1 line-clamp-2 text-muted-foreground text-xs leading-5">
            {description}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function OperatorSectionHeader({
  action,
  description,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-sm">{title}</h2>
          {description ? (
            <p className="mt-1 text-muted-foreground text-sm leading-6">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function OperatorModuleCard({
  action,
  children,
  className,
  description,
  icon,
  title,
}: {
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  icon?: LucideIcon;
  title: string;
}) {
  return (
    <section
      className={cn(
        'grid min-w-0 gap-4 rounded-lg border border-border bg-card p-4',
        className
      )}
    >
      <OperatorSectionHeader
        action={action}
        description={description}
        icon={icon}
        title={title}
      />
      {children ? <div className="min-w-0">{children}</div> : null}
    </section>
  );
}

export function OperatorDataList({
  children,
  empty,
  isEmpty,
  isLoading,
  loadingLabel,
}: {
  children: ReactNode;
  empty?: ReactNode;
  isEmpty?: boolean;
  isLoading?: boolean;
  loadingLabel: string;
}) {
  if (isLoading) {
    // Layout-preserving skeleton (consistent with the rest of the console); the
    // label is kept as an accessible name for assistive tech.
    return (
      <div
        aria-busy="true"
        aria-label={loadingLabel}
        className="grid min-w-0 gap-2"
      >
        <LoadingRows />
      </div>
    );
  }

  return <div className="grid min-w-0 gap-2">{isEmpty ? empty : children}</div>;
}

export function OperatorActionRail({
  actions,
}: {
  actions: Array<{
    description: string;
    href?: string;
    icon: LucideIcon;
    label: string;
    node?: ReactNode;
  }>;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      {actions.map((action) => {
        const Icon = action.icon;
        const content = (
          <>
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate font-medium text-sm">
                {action.label}
              </span>
              <span className="block truncate text-muted-foreground text-xs">
                {action.description}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </>
        );

        if (action.node) {
          return <div key={action.label}>{action.node}</div>;
        }

        return action.href ? (
          <Button
            asChild
            className="h-auto min-w-0 justify-start gap-3 px-3 py-2"
            key={action.label}
            type="button"
            variant="outline"
          >
            <Link href={action.href}>{content}</Link>
          </Button>
        ) : (
          <Button
            className="h-auto min-w-0 justify-start gap-3 px-3 py-2"
            key={action.label}
            type="button"
            variant="outline"
          >
            {content}
          </Button>
        );
      })}
    </div>
  );
}

export function OperatorPrimaryEmptyState({
  action,
  description,
  label,
}: {
  action?: ReactNode;
  description?: string;
  label: string;
}) {
  return (
    <div className="grid min-h-44 place-items-center rounded-lg border border-border border-dashed bg-muted/20 p-6 text-center">
      <div className="max-w-md">
        <PackageOpen className="mx-auto h-9 w-9 text-muted-foreground" />
        <p className="mt-3 font-semibold">{label}</p>
        {description ? (
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            {description}
          </p>
        ) : null}
        {action ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}
