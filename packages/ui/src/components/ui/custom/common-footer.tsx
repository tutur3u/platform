import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { TuturuuLogo } from './tuturuuu-logo';

interface FooterLink {
  label: ReactNode;
  href: string;
  external?: boolean;
}

function FooterColumn({
  title,
  links,
}: {
  title: ReactNode;
  links: FooterLink[];
}) {
  return (
    <div className="grid content-start gap-3">
      <div className="flex items-center gap-2">
        <span className="font-mono-ui text-[0.6rem] text-foreground/35 uppercase tracking-[0.2em]">
          {title}
        </span>
        <span
          aria-hidden
          className="h-px flex-1 bg-gradient-to-r from-foreground/12 to-transparent"
        />
      </div>
      {links.map((link) => (
        <Link
          className="w-fit text-foreground/60 text-sm transition-colors duration-200 hover:text-foreground"
          href={link.href}
          key={link.href}
          {...(link.external
            ? { target: '_blank', rel: 'noopener noreferrer' }
            : {})}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-foreground/10 fill-foreground/50 transition-colors duration-300 hover:border-foreground/25 hover:fill-foreground"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </Link>
  );
}

export function CommonFooter({
  t,
  devMode,
  logoSrc,
}: {
  t: any;
  devMode: boolean;
  logoSrc?: string;
}) {
  const TUTURUUU_URL = devMode
    ? getLocalInternalAppUrl('platform', 'http://localhost:7803')
    : 'https://tuturuuu.com';
  // The standalone qr.tuturuuu.com host is retired; the generator now lives
  // under the tools app.
  const QR_URL = devMode
    ? `${getLocalInternalAppUrl('tools', 'http://localhost:7825')}/qr`
    : 'https://tools.tuturuuu.com/qr';

  const columns: Array<{ title: ReactNode; links: FooterLink[] }> = [
    {
      title: t('common.resources'),
      links: [
        { label: t('common.blog'), href: `${TUTURUUU_URL}/blog` },
        {
          label: t('common.meet-together'),
          href: `${TUTURUUU_URL}/meet-together`,
        },
        { label: t('common.qr_generator'), href: QR_URL },
        {
          label: t('common.facebook_mockup'),
          href: `${TUTURUUU_URL}/facebook-mockup`,
        },
        { label: t('common.branding'), href: `${TUTURUUU_URL}/branding` },
        { label: t('common.ui'), href: `${TUTURUUU_URL}/ui` },
      ],
    },
    {
      title: t('common.company'),
      links: [
        { label: t('common.about'), href: `${TUTURUUU_URL}/about` },
        { label: t('common.partners'), href: `${TUTURUUU_URL}/partners` },
        { label: t('common.careers'), href: `${TUTURUUU_URL}/careers` },
        { label: t('common.contact'), href: `${TUTURUUU_URL}/contact` },
        { label: t('common.pricing'), href: `${TUTURUUU_URL}/pricing` },
      ],
    },
    {
      title: t('common.legal'),
      links: [
        { label: t('common.security'), href: `${TUTURUUU_URL}/security` },
        { label: t('common.terms'), href: `${TUTURUUU_URL}/terms` },
        { label: t('common.privacy'), href: `${TUTURUUU_URL}/privacy` },
        {
          label: t('common.community-guidelines'),
          href: `${TUTURUUU_URL}/community-guidelines`,
        },
        {
          label: t('common.acceptable-use'),
          href: `${TUTURUUU_URL}/acceptable-use`,
        },
      ],
    },
    {
      title: t('common.developers'),
      links: [
        {
          label: t('common.documentation'),
          href: 'https://docs.tuturuuu.com',
          external: true,
        },
        {
          label: t('common.open-source'),
          href: 'https://github.com/tutur3u/platform',
          external: true,
        },
        {
          label: t('common.changelog'),
          href: `${TUTURUUU_URL}/changelog`,
        },
      ],
    },
  ];

  return (
    <footer className="relative mt-16 w-full border-foreground/10 border-t">
      {/* Brand wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-purple/40 to-transparent"
      />

      <div className="mx-auto w-full max-w-7xl px-6 py-14 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          {/* Brand */}
          <div className="grid content-start gap-5">
            <Link
              aria-label="Tuturuuu"
              className="flex w-fit items-center gap-3 transition-opacity hover:opacity-80"
              href={TUTURUUU_URL}
            >
              <TuturuuLogo
                alt="logo"
                className="h-9 w-9"
                height={48}
                src={logoSrc}
                width={48}
              />
              <span className="font-display font-semibold text-2xl tracking-[-0.03em]">
                Tuturuuu
              </span>
            </Link>

            <p className="max-w-xs text-balance text-foreground/60 text-sm leading-relaxed">
              {t('common.footer_tagline')}
            </p>

            <div className="flex flex-wrap gap-2">
              <SocialLink
                href="https://www.facebook.com/tuturuuu"
                label="Facebook"
              >
                <svg
                  className="w-4"
                  viewBox="0 0 512 512"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <title>Facebook</title>
                  <path d="M504 256C504 119 393 8 256 8S8 119 8 256c0 123.78 90.69 226.38 209.25 245V327.69h-63V256h63v-54.64c0-62.15 37-96.48 93.67-96.48 27.14 0 55.52 4.84 55.52 4.84v61h-31.28c-30.8 0-40.41 19.12-40.41 38.73V256h68.78l-11 71.69h-57.78V501C413.31 482.38 504 379.78 504 256z" />
                </svg>
              </SocialLink>

              <SocialLink
                href="https://www.instagram.com/tutu.ruuu/"
                label="Instagram"
              >
                <svg
                  className="w-5"
                  viewBox="0 0 32 32"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <title>Instagram</title>
                  <path d="M20.445 5h-8.891A6.559 6.559 0 0 0 5 11.554v8.891A6.559 6.559 0 0 0 11.554 27h8.891a6.56 6.56 0 0 0 6.554-6.555v-8.891A6.557 6.557 0 0 0 20.445 5zm4.342 15.445a4.343 4.343 0 0 1-4.342 4.342h-8.891a4.341 4.341 0 0 1-4.341-4.342v-8.891a4.34 4.34 0 0 1 4.341-4.341h8.891a4.342 4.342 0 0 1 4.341 4.341l.001 8.891z" />
                  <path d="M16 10.312c-3.138 0-5.688 2.551-5.688 5.688s2.551 5.688 5.688 5.688 5.688-2.551 5.688-5.688-2.55-5.688-5.688-5.688zm0 9.163a3.475 3.475 0 1 1-.001-6.95 3.475 3.475 0 0 1 .001 6.95zM21.7 8.991a1.363 1.363 0 1 1-1.364 1.364c0-.752.51-1.364 1.364-1.364z" />
                </svg>
              </SocialLink>

              <SocialLink
                href="https://x.com/tutur3u"
                label="X (formerly Twitter)"
              >
                <svg
                  className="w-4"
                  viewBox="0 0 42 42"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <title>X (formerly Twitter)</title>
                  <polygon points="41,6 9.929,42 6.215,42 37.287,6" />
                  <polygon
                    className="fill-background"
                    clipRule="evenodd"
                    fillRule="evenodd"
                    points="31.143,41 7.82,7 16.777,7 40.1,41"
                  />
                  <path d="M15.724,9l20.578,30h-4.106L11.618,9H15.724 M17.304,6H5.922l24.694,36h11.382L17.304,6L17.304,6z" />
                </svg>
              </SocialLink>

              <SocialLink href="https://github.com/tutur3u" label="Github">
                <svg
                  className="w-4"
                  viewBox="0 0 512 512"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <title>GitHub</title>
                  <path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z" />
                </svg>
              </SocialLink>

              <SocialLink
                href="https://www.linkedin.com/company/tuturuuu/"
                label="LinkedIn"
              >
                <svg
                  className="w-4"
                  viewBox="0 0 512 512"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <title>LinkedIn</title>
                  <path d="M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3zM135.4 416H69V202.2h66.5V416zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96c21.2 0 38.5 17.3 38.5 38.5 0 21.3-17.2 38.5-38.5 38.5zm282.1 243h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9V416z" />
                </svg>
              </SocialLink>
            </div>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {columns.map((column) => (
              <FooterColumn
                key={String(column.title)}
                links={column.links}
                title={column.title}
              />
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-foreground/10 border-t pt-8 sm:flex-row">
          <p className="text-balance text-center font-mono-ui text-[0.65rem] text-foreground/35 uppercase tracking-[0.12em] sm:text-left">
            {t('common.copyright')}
          </p>
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-foreground/10 px-3 py-1.5 font-mono-ui text-[0.62rem] text-foreground/50 uppercase tracking-[0.16em] transition-colors hover:border-foreground/25 hover:text-foreground"
            href="https://github.com/tutur3u/platform"
            rel="noopener noreferrer"
            target="_blank"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-dynamic-green" />
            {t('common.open-source')}
          </Link>
        </div>
      </div>

      {/* Wordmark finale — the page signs off at full width, clipped by the
          viewport edge so it reads as a mark rather than a heading. */}
      <div
        aria-hidden
        className="relative select-none overflow-hidden px-6 pb-2 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <div className="bg-[linear-gradient(180deg,color-mix(in_oklab,var(--foreground)_11%,transparent),transparent)] bg-clip-text text-center font-display font-extrabold text-[18vw] text-transparent leading-[0.78] tracking-[-0.055em]">
            Tuturuuu
          </div>
        </div>
      </div>
    </footer>
  );
}
