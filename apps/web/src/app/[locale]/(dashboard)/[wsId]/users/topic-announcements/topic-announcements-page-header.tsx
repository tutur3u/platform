'use client';

import type { ReactNode } from 'react';

interface Props {
  actions?: ReactNode;
  description: string;
  title: string;
}

export function TopicAnnouncementsPageHeader({
  actions,
  description,
  title,
}: Props) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        <h2 className="font-semibold text-xl tracking-tight">{title}</h2>
        <p className="max-w-3xl text-muted-foreground text-sm">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
