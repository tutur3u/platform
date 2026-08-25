import {
  MarketingFooter,
  type MarketingFooterColumn,
  MarketingNav,
  type MarketingNavLink,
} from '@tuturuuu/ui/marketing';
import { cacheLife } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { WEB_APP_URL } from '@/constants/common';
import { NavCtaSlot } from './cta-slots';
import { LANDING_NAV_SECTIONS } from './landing-config';
import { LANDING_LOGIN_HREF } from './session-cta';

type Translator = (key: string) => string;

/**
 * Current year for the copyright line.
 *
 * `cacheComponents` rejects reading the clock during render — the value would
 * be frozen into the prerender with no way to tell it had gone stale. Behind
 * `'use cache'` it becomes an explicitly cached value on a daily refresh, which
 * is ample for a number that changes once a year.
 */
async function getCopyrightYear() {
  'use cache';
  cacheLife('days');

  return new Date().getFullYear();
}

/** Footer link targets, built in one place so nav and footer cannot drift. */
function buildFooterColumns(tFooter: Translator): MarketingFooterColumn[] {
  const platformLink = (path: string, key: string) => ({
    external: true,
    href: `${WEB_APP_URL}${path}`,
    label: tFooter(`links.${key}`),
  });

  return [
    {
      id: 'product',
      title: tFooter('product'),
      links: (['workflow', 'build', 'design', 'embed'] as const).map((key) => ({
        href: `#${key}`,
        label: tFooter(`links.${key}`),
      })),
    },
    {
      id: 'platform',
      title: tFooter('platform'),
      links: [
        { external: true, href: WEB_APP_URL, label: tFooter('links.tuturuuu') },
        platformLink('/products', 'products'),
        platformLink('/pricing', 'pricing'),
        platformLink('/docs', 'docs'),
      ],
    },
    {
      id: 'legal',
      title: tFooter('legal'),
      links: [
        platformLink('/terms', 'terms'),
        platformLink('/privacy', 'privacy'),
        platformLink('/security', 'security'),
        platformLink('/contact', 'contact'),
      ],
    },
  ];
}

/**
 * Chrome around the landing sections: sticky nav, page, footer.
 *
 * Kept separate from the section composition so the page file stays a readable
 * table of contents, and so a second marketing route can reuse the same frame.
 */
export async function LandingShell({ children }: { children: ReactNode }) {
  const [t, tNav, tFooter, year] = await Promise.all([
    getTranslations('forms.landing'),
    getTranslations('forms.landing.nav'),
    getTranslations('forms.landing.footer'),
    getCopyrightYear(),
  ]);

  const links: MarketingNavLink[] = LANDING_NAV_SECTIONS.map((section) => ({
    href: `#${section}`,
    label: tNav(section),
  }));

  return (
    <div className="relative w-full overflow-x-hidden">
      <MarketingNav
        action={<NavCtaSlot />}
        appName={t('app_name')}
        links={links}
        secondaryAction={{
          href: LANDING_LOGIN_HREF,
          label: tNav('sign_in'),
        }}
      />

      <main className="relative">{children}</main>

      <MarketingFooter
        appName={t('app_name')}
        columns={buildFooterColumns(tFooter as unknown as Translator)}
        legal={tFooter('legal_line', { year })}
        tagline={tFooter('tagline')}
      />
    </div>
  );
}
