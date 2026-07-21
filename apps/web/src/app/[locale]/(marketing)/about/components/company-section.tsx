import { Globe, Layers, Mail } from '@tuturuuu/icons/lucide';
import { Reveal } from '@/components/landing/shared/reveal';
import { Panel, SectionShell } from '@/components/landing/shared/section-shell';
import { useAboutTranslations } from './use-about-translations';

const detailKeys = [
  { label: 'taxCode', value: 'taxCodeValue' },
  { label: 'founded', value: 'foundedValue' },
  { label: 'ceo', value: 'ceoValue' },
] as const;

const addressKeys = ['address1', 'address2', 'address3', 'address4'] as const;

const links = [
  { key: 'website', href: 'https://tuturuuu.com', icon: Globe, external: true },
  {
    key: 'github',
    href: 'https://github.com/tutur3u/platform',
    icon: Layers,
    external: true,
  },
  {
    key: 'contact',
    href: 'mailto:contact@tuturuuu.com',
    icon: Mail,
    external: false,
  },
] as const;

/** The legal record: who the entity is, where it is, how to reach it. */
export function CompanySection() {
  const t = useAboutTranslations();

  return (
    <SectionShell
      eyebrow={t('sections.company.eyebrow')}
      index="09"
      subtitle={t('companyInfo.subtitle')}
      title={t('companyInfo.title')}
      width="narrow"
    >
      <Reveal>
        <Panel className="px-6 py-9 sm:px-10 sm:py-10">
          <div className="grid gap-10 sm:grid-cols-2">
            <div>
              <span className="font-mono-ui text-[0.62rem] text-foreground/35 uppercase tracking-[0.2em]">
                {t('companyInfo.details.title')}
              </span>
              <dl className="mt-5 grid gap-4">
                {detailKeys.map((detail) => (
                  <div key={detail.label}>
                    <dt className="text-foreground/40 text-xs">
                      {t(`companyInfo.details.${detail.label}`)}
                    </dt>
                    <dd className="mt-0.5 text-foreground/80 text-sm tabular-nums">
                      {t(`companyInfo.details.${detail.value}`)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <span className="font-mono-ui text-[0.62rem] text-foreground/35 uppercase tracking-[0.2em]">
                {t('companyInfo.location.title')}
              </span>
              <address className="mt-5 space-y-0.5 text-foreground/60 text-sm not-italic leading-relaxed">
                {addressKeys.map((addressKey) => (
                  <div key={addressKey}>
                    {t(`companyInfo.location.${addressKey}`)}
                  </div>
                ))}
              </address>
            </div>
          </div>

          <div className="mt-9 flex flex-wrap gap-2 border-foreground/[0.08] border-t pt-7">
            {links.map((link) => (
              <a
                className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.02] px-4 py-2 text-foreground/70 text-sm transition-colors duration-300 hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                href={link.href}
                key={link.key}
                {...(link.external
                  ? { rel: 'noopener noreferrer', target: '_blank' }
                  : {})}
              >
                <link.icon className="h-3.5 w-3.5 text-foreground/40" />
                {t(`companyInfo.links.${link.key}`)}
              </a>
            ))}
          </div>
        </Panel>
      </Reveal>
    </SectionShell>
  );
}
