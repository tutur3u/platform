'use client';

import { AppWindow, XIcon } from '@tuturuuu/icons/lucide-static';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import {
  getAvatarUrl,
  getInitials,
} from './internal-app-account-confirmation-parts';

/**
 * The neutral tile for an app without a registered logo: one calm glyph
 * rather than letters, which read as a placeholder. Decorative.
 */
export function AppGlyph({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex items-center justify-center rounded-2xl border bg-muted text-muted-foreground',
        className
      )}
    >
      <AppWindow className="size-1/2" strokeWidth={1.75} />
    </span>
  );
}

/**
 * The Tuturuuu mark beside the requesting app: the co-brand row on every
 * "Continue to {app}" card. Decorative; the card's heading names the app.
 */
export function CoBrandRow() {
  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center gap-2.5"
    >
      <span
        className="block size-9 bg-center bg-contain bg-no-repeat"
        style={{ backgroundImage: `url(${TUTURUUU_LOCAL_LOGO_URL})` }}
      />
      <XIcon className="size-4 text-muted-foreground" />
      <AppGlyph className="size-9 rounded-xl" />
    </div>
  );
}

/** The signed-in account as a centred card: avatar, name and detail. */
export function AccountAvatarCard({
  avatarUrl,
  detail,
  name,
}: {
  avatarUrl?: string | null;
  detail?: ReactNode;
  name: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-2xl border bg-card px-5 py-5 text-center">
      <Avatar className="size-16">
        <AvatarImage alt={name} src={getAvatarUrl(avatarUrl)} />
        <AvatarFallback className="bg-calendar-bg-pink font-extrabold text-dynamic-pink text-xl">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 max-w-full flex-col gap-0.5">
        <p className="truncate font-extrabold text-lg">{name}</p>
        {detail ? (
          <p className="truncate text-muted-foreground text-sm">{detail}</p>
        ) : null}
      </div>
    </div>
  );
}

/** A calm progress card: a spinner and one live label. */
export function AuthProgressCard({
  description,
  label,
}: {
  description?: ReactNode;
  label: string;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-[28px] border bg-card px-6 py-10 text-center">
      <LoadingIndicator aria-hidden className="size-6" />
      <p
        aria-atomic="true"
        aria-live="polite"
        className="font-semibold text-sm"
        role="status"
      >
        {label}
      </p>
      {description ? (
        <p className="text-balance text-muted-foreground text-sm">
          {description}
        </p>
      ) : null}
    </div>
  );
}
