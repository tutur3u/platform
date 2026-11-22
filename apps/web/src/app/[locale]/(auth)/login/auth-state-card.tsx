'use client';

import { ArrowLeft } from '@tuturuuu/icons/lucide-static';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

const LINK_CLASS =
  'inline-flex min-h-11 items-center gap-1 rounded-full font-semibold text-muted-foreground text-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50';

/** A quiet text action (Back, Sign out, Use password instead). */
export function AuthTextButton({
  children,
  className,
  disabled,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(LINK_CLASS, className)}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function AuthBackButton({
  disabled,
  label,
  onClick,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <AuthTextButton
      className="-ml-1 self-start"
      disabled={disabled}
      onClick={onClick}
    >
      <ArrowLeft aria-hidden className="size-4" />
      {label}
    </AuthTextButton>
  );
}

/**
 * The shared auth state card: one 400px column, an optional back action,
 * the illustration on top, a title and a short description, then the step's
 * single primary action and its quieter alternatives.
 */
export function AuthStateCard({
  align = 'center',
  back,
  children,
  description,
  illustration,
  testId,
  title,
  titleAs: Title = 'h2',
}: {
  align?: 'center' | 'start';
  back?: ReactNode;
  children?: ReactNode;
  description?: ReactNode;
  illustration?: ReactNode;
  testId?: string;
  title: ReactNode;
  titleAs?: 'h1' | 'h2';
}) {
  return (
    <Card
      className="w-full overflow-hidden rounded-[28px] border bg-card"
      data-testid={testId}
    >
      <CardContent className="flex flex-col gap-4 p-6">
        {back}
        {illustration}
        <div
          className={cn(
            'flex flex-col gap-1.5',
            align === 'center' ? 'text-center' : 'text-left'
          )}
        >
          <Title className="text-balance font-extrabold text-2xl tracking-[-0.02em]">
            {title}
          </Title>
          {description ? (
            <div className="text-balance text-muted-foreground text-sm leading-relaxed">
              {description}
            </div>
          ) : null}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/** A divider with a centred label ("or"). */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 font-semibold text-muted-foreground text-xs">
      <span aria-hidden className="h-px flex-1 bg-border" />
      <span>{label}</span>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}
