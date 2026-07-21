'use client';

import { Boxes, Flame, Radio, Waves } from '@tuturuuu/icons/lucide';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { RevealGroup, RevealItem } from '../shared/reveal';
import { type SurfaceAccent, SurfaceCard } from '../shared/surface-card';

/**
 * The four systems that sit behind Mira.
 *
 * The copy for these already existed in the message bundles under
 * `landing.aiCore` but was never rendered anywhere — this surfaces it.
 */
const systems: Array<{
  key: 'aurora' | 'rewise' | 'nova' | 'crystal';
  icon: ComponentType<{ className?: string }>;
  accent: SurfaceAccent;
}> = [
  { key: 'aurora', icon: Waves, accent: 'cyan' },
  { key: 'rewise', icon: Boxes, accent: 'blue' },
  { key: 'nova', icon: Flame, accent: 'orange' },
  { key: 'crystal', icon: Radio, accent: 'pink' },
];

export function AiCoreSystems() {
  const t = useTranslations('landing.aiCore');

  return (
    <RevealGroup
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      stagger={0.07}
    >
      {systems.map((system) => (
        <RevealItem className="h-full" key={system.key}>
          <SurfaceCard
            accent={system.accent}
            description={t(`${system.key}.description` as never)}
            eyebrow={t(`${system.key}.role` as never)}
            icon={system.icon}
            title={t(`${system.key}.name` as never)}
          />
        </RevealItem>
      ))}
    </RevealGroup>
  );
}
