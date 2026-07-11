'use client';

import type { ReactNode } from 'react';

interface Props {
  actions?: ReactNode;
  description: string;
  title?: string;
}

/**
 * Lightweight per-page header. The feature title now lives in the shell and the
 * active tab, so `title` is optional — pages typically pass only a one-line
 * description plus any page-level actions.
 */
export function TopicAnnouncementsPageHeader({
  actions,
  description,
  title,
}: Props) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        {title ? (
          <h2 className="font-semibold text-xl tracking-tight">{title}</h2>
        ) : null}
        <p className="max-w-3xl text-muted-foreground text-sm">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
