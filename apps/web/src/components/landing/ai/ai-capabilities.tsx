'use client';

import {
  CalendarClock,
  FileText,
  ListChecks,
  Search,
  TrendingUp,
  Video,
} from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { RevealGroup, RevealItem } from '../shared/reveal';

const capabilities: Array<{
  key:
    | 'scheduling'
    | 'extraction'
    | 'meetings'
    | 'drafting'
    | 'insight'
    | 'search';
  icon: ComponentType<{ className?: string }>;
  accent: string;
}> = [
  { key: 'scheduling', icon: CalendarClock, accent: 'text-dynamic-blue' },
  { key: 'extraction', icon: ListChecks, accent: 'text-dynamic-green' },
  { key: 'meetings', icon: Video, accent: 'text-dynamic-orange' },
  { key: 'drafting', icon: FileText, accent: 'text-dynamic-purple' },
  { key: 'insight', icon: TrendingUp, accent: 'text-dynamic-pink' },
  { key: 'search', icon: Search, accent: 'text-dynamic-cyan' },
];

/**
 * Concrete capability list.
 *
 * Deliberately plainer than the cards above it: hairline-divided cells rather
 * than six more bordered boxes, so the section does not read as card soup.
 */
export function AiCapabilities() {
  const t = useTranslations('landing.aiCapabilities.capabilities');

  return (
    <div>
      <h3 className="mb-8 text-center font-mono-ui text-[0.62rem] text-foreground/35 uppercase tracking-[0.2em]">
        {t('title')}
      </h3>

      <RevealGroup
        className="grid grid-cols-1 divide-y divide-foreground/[0.08] border-foreground/[0.08] border-y sm:grid-cols-2 sm:divide-x lg:grid-cols-3"
        stagger={0.05}
      >
        {capabilities.map((capability) => (
          <RevealItem key={capability.key}>
            <div className="group h-full px-5 py-6 transition-colors duration-500 hover:bg-foreground/[0.02]">
              <capability.icon
                className={cn(
                  'h-4 w-4 transition-transform duration-500 group-hover:scale-110',
                  capability.accent
                )}
              />
              <h4 className="mt-4 font-display font-semibold text-base tracking-[-0.01em]">
                {t(`${capability.key}.title` as never)}
              </h4>
              <p className="mt-2 text-foreground/50 text-sm leading-relaxed">
                {t(`${capability.key}.description` as never)}
              </p>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>
    </div>
  );
}
