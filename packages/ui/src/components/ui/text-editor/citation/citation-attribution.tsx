import type { ReactNode } from 'react';
import type { CitationLabels } from './labels';

const CSL_URL = 'https://citationstyles.org/';
const CITEPROC_SOURCE_URL = 'https://github.com/Juris-M/citeproc-js';
const CPAL_LICENSE_URL = 'https://opensource.org/license/cpal-1-0';
const CSL_STYLES_URL = 'https://github.com/citation-style-language/styles';
const CC_BY_SA_URL = 'https://creativecommons.org/licenses/by-sa/3.0/';

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-4 hover:text-foreground"
    >
      {children}
    </a>
  );
}

/** Required formatter (CPAL) and style (CC BY-SA) notices wherever output shows. */
export function CitationAttribution({
  labels,
}: {
  labels: CitationLabels['attribution'];
}) {
  return (
    <footer
      data-citation-attribution=""
      className="flex flex-col gap-1 text-muted-foreground text-xs leading-relaxed"
    >
      <span className="font-medium text-foreground">{labels.heading}</span>
      <span>
        {labels.engineNotice} {labels.engineLicense}{' '}
        <ExternalLink href={CSL_URL}>citationstyles.org</ExternalLink>
        {' · '}
        <ExternalLink href={CITEPROC_SOURCE_URL}>
          {labels.engineSource}
        </ExternalLink>
        {' · '}
        <ExternalLink href={CPAL_LICENSE_URL}>
          {labels.engineLicenseLink}
        </ExternalLink>
      </span>
      <span>
        {labels.styles}{' '}
        <ExternalLink href={CSL_STYLES_URL}>{labels.stylesSource}</ExternalLink>
        {' · '}
        <ExternalLink href={CC_BY_SA_URL}>CC BY-SA 3.0</ExternalLink>
      </span>
    </footer>
  );
}
