'use client';

import { ChevronDown, Info } from '@tuturuuu/icons';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { MiraConsentInfoContent } from '../../live-assistant/mira-consent-box';
import { MiraAdultNotice } from '../../live-assistant/mira-adult-notice';

/**
 * Every notice about Mira in one disclosure: the 18+ rule, what Mira does with
 * data, retention, readers, the privacy links, and the way to report someone
 * under 18 (`children`).
 */
export function MiraAbout({ children }: { children?: ReactNode }) {
  const t = useTranslations('meet.mira_consent');
  return (
    <Collapsible className="border-t pt-2">
      <CollapsibleTrigger className="group flex min-h-8 w-full items-center gap-1.5 rounded-md text-start font-medium text-xs outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11 [&[data-state=closed]]:text-muted-foreground">
        <Info aria-hidden className="size-3.5 shrink-0" />
        <span className="flex-1">{t('about')}</span>
        <ChevronDown
          aria-hidden
          className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">
        <MiraAdultNotice />
        <MiraConsentInfoContent />
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
