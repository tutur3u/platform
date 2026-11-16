import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

export const CITEPROC_SOURCE_URL = 'https://github.com/Juris-M/citeproc-js';
export const CPAL_LICENSE_URL = 'https://opensource.org/license/cpal-1-0';
export const CSL_URL = 'https://citationstyles.org/';
export const CSL_STYLES_URL =
  'https://github.com/citation-style-language/styles';
export const CC_BY_SA_URL = 'https://creativecommons.org/licenses/by-sa/3.0/';

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      className="text-foreground underline underline-offset-4 hover:text-muted-foreground"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

/** Required engine (CPAL) and style (CC BY-SA) attribution for the formatter. */
export async function CitationAttribution({ locale }: { locale: 'en' | 'vi' }) {
  const t = await getTranslations({ locale, namespace: 'cite.attribution' });

  return (
    <section
      aria-labelledby="cite-attribution-heading"
      className="space-y-2 px-1 text-muted-foreground text-xs leading-relaxed"
    >
      <h2
        className="font-medium text-foreground text-xs"
        id="cite-attribution-heading"
      >
        {t('heading')}
      </h2>
      <p>
        {t('engine_notice')} {t('engine_license')}{' '}
        <ExternalLink href={CSL_URL}>citationstyles.org</ExternalLink>
        {' · '}
        <ExternalLink href={CITEPROC_SOURCE_URL}>
          {t('engine_source')}
        </ExternalLink>
        {' · '}
        <ExternalLink href={CPAL_LICENSE_URL}>
          {t('engine_license_link')}
        </ExternalLink>
      </p>
      <p>
        {t('styles')}{' '}
        <ExternalLink href={CSL_STYLES_URL}>{t('styles_source')}</ExternalLink>
        {' · '}
        <ExternalLink href={CC_BY_SA_URL}>CC BY-SA 3.0</ExternalLink>
      </p>
      <p>{t('independence')}</p>
    </section>
  );
}
