import { Clock, Github, Globe, Mail } from '@tuturuuu/icons/lucide';
import { useTranslations } from 'next-intl';
import { RevealGroup, RevealItem } from '@/components/landing/shared/reveal';
import { SectionShell } from '@/components/landing/shared/section-shell';
import { SurfaceCard } from '@/components/landing/shared/surface-card';
import { GITHUB_OWNER } from '@/constants/common';

/**
 * The four ways in.
 *
 * Cards that have an `href` become the link themselves, so the whole surface is
 * the target rather than a small anchor buried inside it. Accents are written
 * out literally — never composed from a runtime string, which Tailwind cannot
 * resolve.
 */
export function ContactChannels() {
  const t = useTranslations('contact');

  const channels = [
    {
      icon: Mail,
      accent: 'blue',
      title: t('methods.email.title'),
      value: 'contact@tuturuuu.com',
      description: t('methods.email.description'),
      href: 'mailto:contact@tuturuuu.com',
      external: false,
    },
    {
      icon: Github,
      accent: 'purple',
      title: t('methods.github.title'),
      value: 'github.com/tutur3u',
      description: t('methods.github.description'),
      href: `https://github.com/${GITHUB_OWNER}`,
      external: true,
    },
    {
      icon: Globe,
      accent: 'green',
      title: t('methods.support.title'),
      value: t('methods.support.value'),
      description: t('methods.support.description'),
      href: undefined,
      external: false,
    },
    {
      icon: Clock,
      accent: 'orange',
      title: t('methods.response.title'),
      value: t('methods.response.value'),
      description: t('methods.response.description'),
      href: undefined,
      external: false,
    },
  ] as const;

  return (
    <SectionShell
      bloom="purple"
      eyebrow={t('methods.eyebrow')}
      index="01"
      subtitle={t('methods.subtitle')}
      title={t('methods.title')}
    >
      <RevealGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {channels.map((channel) => (
          <RevealItem key={channel.title}>
            <SurfaceCard
              accent={channel.accent}
              description={
                <>
                  <span className="block break-words font-mono-ui text-[0.7rem] text-foreground/75 tracking-[0.02em]">
                    {channel.value}
                  </span>
                  <span className="mt-2 block">{channel.description}</span>
                </>
              }
              external={channel.external}
              href={channel.href}
              icon={channel.icon}
              title={channel.title}
            />
          </RevealItem>
        ))}
      </RevealGroup>
    </SectionShell>
  );
}
