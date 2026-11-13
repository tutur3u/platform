'use client';

import { Leaf } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { ComponentProps, ReactNode } from 'react';
import { MeetingTitle } from './meeting-title';

export function CallHeader({
  solo,
  children,
  ...title
}: ComponentProps<typeof MeetingTitle> & {
  solo: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('meet.call');
  return (
    <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
      <MeetingTitle {...title} />
      {solo ? (
        <output
          className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-muted-foreground text-xs"
          title={t('solo_hint')}
        >
          <Leaf className="size-3.5" />
          {t('solo_mode')}
        </output>
      ) : null}
      {children}
    </header>
  );
}
