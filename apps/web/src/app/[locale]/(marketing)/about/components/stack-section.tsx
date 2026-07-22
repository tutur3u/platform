import { Brain, Code2, Package, Server } from '@tuturuuu/icons/lucide-static';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentType } from 'react';
import { RevealGroup, RevealItem } from '@/components/landing/shared/reveal';
import { SectionShell } from '@/components/landing/shared/section-shell';
import { useAboutTranslations } from './use-about-translations';

/** Static triples — Tailwind cannot resolve a class built at runtime. */
const layers: Array<{
  key: string;
  icon: ComponentType<{ className?: string }>;
  text: string;
  dot: string;
}> = [
  {
    key: 'frontend',
    icon: Code2,
    text: 'text-dynamic-cyan',
    dot: 'bg-dynamic-cyan/70',
  },
  {
    key: 'backend',
    icon: Server,
    text: 'text-dynamic-green',
    dot: 'bg-dynamic-green/70',
  },
  {
    key: 'infrastructure',
    icon: Package,
    text: 'text-dynamic-blue',
    dot: 'bg-dynamic-blue/70',
  },
  {
    key: 'ai',
    icon: Brain,
    text: 'text-dynamic-purple',
    dot: 'bg-dynamic-purple/70',
  },
];

const techKeys = ['tech1', 'tech2', 'tech3', 'tech4'] as const;

/** The stack, listed plainly. */
export function StackSection() {
  const t = useAboutTranslations();

  return (
    <SectionShell
      bloom="blue"
      eyebrow={t('sections.stack.eyebrow')}
      index="06"
      subtitle={t('techStack.subtitle')}
      title={`${t('techStack.title.part1')} ${t('techStack.title.highlight')}`}
    >
      <RevealGroup
        className="grid grid-cols-1 divide-y divide-foreground/[0.08] border-foreground/[0.08] border-y sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0"
        stagger={0.06}
      >
        {layers.map((layer) => (
          <RevealItem key={layer.key}>
            <div className="group h-full px-5 py-6 transition-colors duration-500 hover:bg-foreground/[0.02]">
              <layer.icon
                className={cn(
                  'h-4 w-4 transition-transform duration-500 group-hover:scale-110',
                  layer.text
                )}
              />
              <div className="mt-4 font-mono-ui text-[0.62rem] text-foreground/40 uppercase tracking-[0.2em]">
                {t(`techStack.${layer.key}.category`)}
              </div>
              <ul className="mt-3 grid gap-2">
                {techKeys.map((techKey) => (
                  <li
                    className="flex items-center gap-2.5 text-foreground/60 text-sm"
                    key={techKey}
                  >
                    <span
                      aria-hidden
                      className={cn('h-1 w-1 rounded-full', layer.dot)}
                    />
                    {t(`techStack.${layer.key}.${techKey}`)}
                  </li>
                ))}
              </ul>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>
    </SectionShell>
  );
}
