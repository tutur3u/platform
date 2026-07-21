import {
  ArrowUpRight,
  Brain,
  Check,
  Github,
  Mail,
  Rocket,
  Star,
  Zap,
} from '@tuturuuu/icons/lucide';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Panel,
  SectionEyebrow,
} from '@/components/landing/shared/section-shell';
import { SurfaceCard } from '@/components/landing/shared/surface-card';

const linkRow =
  'group flex items-center gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.015] p-3 transition-colors hover:border-foreground/20 hover:bg-foreground/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/**
 * The column beside the form: why writing in is worth it, who is on the other
 * end, and the two or three places a visitor might have meant to go instead.
 */
export function ContactAside() {
  const t = useTranslations('contact');

  const highlights = [
    {
      icon: Brain,
      accent: 'cyan',
      title: t('highlights.technical.title'),
      description: t('highlights.technical.description'),
    },
    {
      icon: Star,
      accent: 'yellow',
      title: t('highlights.premium.title'),
      description: t('highlights.premium.description'),
    },
    {
      icon: Zap,
      accent: 'pink',
      title: t('highlights.beta.title'),
      description: t('highlights.beta.description'),
    },
  ] as const;

  const founderLinks = [
    {
      icon: Mail,
      label: t('founder.contact.email'),
      value: 'phucvo@tuturuuu.com',
      href: 'mailto:phucvo@tuturuuu.com',
      tone: 'text-dynamic-pink',
      external: false,
    },
    {
      icon: Github,
      label: t('founder.contact.github'),
      value: '@vhpx',
      href: 'https://github.com/vhpx',
      tone: 'text-dynamic-purple',
      external: true,
    },
  ] as const;

  const quickLinks = [
    { label: t('quickLinks.about'), href: '/about', external: false },
    { label: t('quickLinks.pricing'), href: '/#pricing', external: false },
    {
      label: t('quickLinks.github'),
      href: 'https://github.com/tutur3u/platform',
      external: true,
    },
  ] as const;

  return (
    <aside className="flex flex-col gap-10">
      <div>
        <SectionEyebrow>{t('highlights.title')}</SectionEyebrow>
        <div className="mt-5 grid gap-2.5">
          {highlights.map((highlight) => (
            <SurfaceCard
              accent={highlight.accent}
              description={highlight.description}
              icon={highlight.icon}
              key={highlight.title}
              layout="inline"
              title={highlight.title}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionEyebrow>{t('founder.title')}</SectionEyebrow>
        <Panel className="mt-5 p-5">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-dynamic-pink/25 bg-dynamic-pink/10">
              <Rocket className="h-5 w-5 text-dynamic-pink" />
            </span>
            <div className="min-w-0">
              <h3 className="font-display font-semibold text-lg tracking-[-0.01em]">
                {t('founder.name')}
              </h3>
              <p className="mt-1 font-mono-ui text-[0.65rem] text-foreground/45 uppercase tracking-[0.16em]">
                {t('founder.role')}
              </p>
            </div>
          </div>

          <p className="mt-5 text-foreground/55 text-sm leading-relaxed">
            {t('founder.description')}
          </p>

          <div className="mt-5 grid gap-2.5">
            {founderLinks.map((link) => (
              <a
                className={linkRow}
                href={link.href}
                key={link.href}
                {...(link.external
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/[0.03] ${link.tone}`}
                >
                  <link.icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono-ui text-[0.6rem] text-foreground/45 uppercase tracking-[0.18em]">
                    {link.label}
                  </span>
                  <span className="mt-1 block truncate text-foreground/75 text-sm">
                    {link.value}
                  </span>
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-foreground/25 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground/50" />
              </a>
            ))}
          </div>
        </Panel>
      </div>

      <div>
        <SectionEyebrow>{t('quickLinks.title')}</SectionEyebrow>
        <div className="mt-5 grid gap-2.5">
          {quickLinks.map((link) =>
            link.external ? (
              <a
                className={linkRow}
                href={link.href}
                key={link.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                <Check className="h-3.5 w-3.5 shrink-0 text-dynamic-blue" />
                <span className="flex-1 text-foreground/75 text-sm">
                  {link.label}
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-foreground/25 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground/50" />
              </a>
            ) : (
              <Link className={linkRow} href={link.href} key={link.href}>
                <Check className="h-3.5 w-3.5 shrink-0 text-dynamic-blue" />
                <span className="flex-1 text-foreground/75 text-sm">
                  {link.label}
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-foreground/25 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground/50" />
              </Link>
            )
          )}
        </div>
      </div>
    </aside>
  );
}
