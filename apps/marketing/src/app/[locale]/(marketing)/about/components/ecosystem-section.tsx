import {
  Bot,
  Calendar,
  CheckCircle2,
  Cpu,
  Database,
  Layers,
  MessageSquare,
  Sparkles,
  Users,
} from '@tuturuuu/icons/lucide-static';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentType } from 'react';
import {
  Reveal,
  RevealGroup,
  RevealItem,
} from '@/components/landing/shared/reveal';
import { Panel, SectionShell } from '@/components/landing/shared/section-shell';
import {
  type SurfaceAccent,
  SurfaceCard,
} from '@/components/landing/shared/surface-card';
import { useAboutTranslations } from './use-about-translations';

const apps: Array<{
  key: string;
  icon: ComponentType<{ className?: string }>;
  accent: SurfaceAccent;
}> = [
  { key: 'tuplan', icon: Calendar, accent: 'blue' },
  { key: 'tudo', icon: CheckCircle2, accent: 'green' },
  { key: 'tumeet', icon: Users, accent: 'purple' },
  { key: 'tuchat', icon: MessageSquare, accent: 'cyan' },
];

const aiCore: Array<{
  key: string;
  icon: ComponentType<{ className?: string }>;
  text: string;
}> = [
  { key: 'mira', icon: Bot, text: 'text-dynamic-pink' },
  { key: 'aurora', icon: Layers, text: 'text-dynamic-blue' },
  { key: 'rewise', icon: Database, text: 'text-dynamic-purple' },
  { key: 'nova', icon: Cpu, text: 'text-dynamic-orange' },
  { key: 'crystal', icon: Sparkles, text: 'text-dynamic-cyan' },
];

/** The apps people use, and the intelligence layer underneath them. */
export function EcosystemSection() {
  const t = useAboutTranslations();

  return (
    <SectionShell
      bloom="cyan"
      eyebrow={t('sections.ecosystem.eyebrow')}
      index="04"
      subtitle={t('ecosystem.subtitle')}
      title={`${t('ecosystem.title.part1')} ${t('ecosystem.title.highlight')}`}
    >
      <RevealGroup
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        stagger={0.06}
      >
        {apps.map((app) => (
          <RevealItem className="h-full" key={app.key}>
            <SurfaceCard
              accent={app.accent}
              description={t(`ecosystem.${app.key}.description`)}
              icon={app.icon}
              title={t(`ecosystem.${app.key}.name`)}
            />
          </RevealItem>
        ))}
      </RevealGroup>

      <Reveal className="mt-6">
        <Panel className="px-6 py-10 sm:px-10">
          <div className="flex flex-col items-center text-center">
            <span className="font-mono-ui text-[0.62rem] text-foreground/35 uppercase tracking-[0.2em]">
              {t('ecosystem.aiCore.subtitle')}
            </span>
            <h3 className="mt-3 font-display font-semibold text-2xl tracking-[-0.02em]">
              {t('ecosystem.aiCore.title')}
            </h3>
          </div>

          <div className="mt-9 grid grid-cols-1 divide-y divide-foreground/[0.08] border-foreground/[0.08] border-y sm:grid-cols-2 sm:divide-x lg:grid-cols-5 lg:divide-y-0">
            {aiCore.map((system) => (
              <div
                className="group px-5 py-6 text-center transition-colors duration-500 hover:bg-foreground/[0.02]"
                key={system.key}
              >
                <system.icon
                  className={cn(
                    'mx-auto h-4 w-4 transition-transform duration-500 group-hover:scale-110',
                    system.text
                  )}
                />
                <div className="mt-4 font-display font-semibold text-sm tracking-[-0.01em]">
                  {t(`ecosystem.aiCore.${system.key}.name`)}
                </div>
                <p className="mt-1 font-mono-ui text-[0.6rem] text-foreground/40 uppercase tracking-[0.16em]">
                  {t(`ecosystem.aiCore.${system.key}.role`)}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </Reveal>
    </SectionShell>
  );
}
