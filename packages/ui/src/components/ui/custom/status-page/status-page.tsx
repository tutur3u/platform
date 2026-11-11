import type { ReactNode } from 'react';
import { TUTURUUU_REMOTE_LOGO_URL } from '../tuturuuu-logo-urls';
import { StatusBackLink, StatusRetryButton } from './actions';
import {
  resolveStatusPageLocale,
  STATUS_PAGE_COPY,
  type StatusPageLocale,
  type StatusPageVariant,
} from './copy';
import { STATUS_PAGE_CSS, STATUS_PAGE_STYLE_ID } from './styles';

export const TUTURUUU_HOME_URL = 'https://tuturuuu.com';

export interface StatusPageProps {
  variant: StatusPageVariant;
  /** `en`/`vi`, a locale tag, a document `lang` or a URL path. */
  locale?: string | null;
  /** Current app, shown beside the logo (`Tasks`, `Calendar`). */
  appName?: string;
  /** The current app's start page. */
  appHref?: string;
  /** The app's search page, when it has one. */
  searchHref?: string;
  /** The app's help page, when it has one. */
  helpHref?: string;
  /** Where Back goes without history; defaults to `appHref`, then home. */
  backHref?: string;
  /** Tuturuuu home; defaults to https://tuturuuu.com. */
  homeHref?: string;
  /** Logo URL the app's CSP allows; defaults to the tuturuuu.com logo. */
  logoSrc?: string;
  /** The framework's reset/retry. Shown as "Try again" on the error variant. */
  onRetry?: () => void;
  /** Safe error reference (Next `digest`). */
  reference?: string;
  /** Developer-only details; pass only in development. */
  details?: string;
  /**
   * `page` renders the Tuturuuu header and footer around the message (a whole
   * document or an app-level boundary). `inline` renders only the message, for
   * a boundary nested inside an app's own shell.
   */
  chrome?: 'page' | 'inline';
}

function ArrowLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="m12 19-7-7 7-7M19 12H5" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
    </svg>
  );
}

/**
 * The one Tuturuuu not-found / error page. Framework-agnostic and
 * server-rendered: plain anchors, its own scoped stylesheet and no theme
 * script, so Next, TanStack Start and a bare Worker response render the same
 * markup. Only Back and Try again hydrate.
 */
export function StatusPage({
  variant,
  locale,
  appName,
  appHref,
  searchHref,
  helpHref,
  backHref,
  homeHref = TUTURUUU_HOME_URL,
  logoSrc = TUTURUUU_REMOTE_LOGO_URL,
  onRetry,
  reference,
  details,
  chrome = 'page',
}: StatusPageProps) {
  const lang: StatusPageLocale = resolveStatusPageLocale(locale);
  const copy = STATUS_PAGE_COPY[lang];
  const text = copy[variant];
  const titleId = `ttr-sp-title-${variant}`;
  const appLabel = appName
    ? copy.openApp.replace('{app}', appName)
    : copy.appHome;
  const showAppLink = Boolean(appHref && appHref !== homeHref);

  const message: ReactNode = (
    <div className="ttr-sp__panel">
      <p aria-hidden="true" className="ttr-sp__code">
        {text.code}
      </p>
      <h1 className="ttr-sp__title" id={titleId}>
        {text.title}
      </h1>
      <p className="ttr-sp__desc">{text.description}</p>
      <div className="ttr-sp__actions">
        {variant === 'error' && onRetry ? (
          <StatusRetryButton onRetry={onRetry}>
            <RetryIcon />
            {copy.retry}
          </StatusRetryButton>
        ) : null}
        <StatusBackLink href={backHref ?? appHref ?? homeHref}>
          <ArrowLeftIcon />
          {copy.back}
        </StatusBackLink>
        {showAppLink ? (
          <a
            className="ttr-sp__btn"
            data-action="app"
            data-primary={variant === 'not-found' ? '' : undefined}
            href={appHref}
          >
            {appLabel}
          </a>
        ) : null}
        <a
          className="ttr-sp__btn"
          data-action="home"
          data-primary={
            variant === 'not-found' && !showAppLink ? '' : undefined
          }
          href={homeHref}
        >
          {copy.home}
        </a>
      </div>
      {reference ? (
        <p className="ttr-sp__ref">
          <span>{copy.reference}</span>
          <code>{reference}</code>
        </p>
      ) : null}
      {details ? (
        <details className="ttr-sp__details">
          <summary>{copy.details}</summary>
          <pre>{details}</pre>
        </details>
      ) : null}
    </div>
  );

  return (
    <div
      className="ttr-sp"
      data-chrome={chrome}
      data-status-page={variant}
      lang={lang}
    >
      <style href={STATUS_PAGE_STYLE_ID} precedence="default">
        {STATUS_PAGE_CSS}
      </style>
      {chrome === 'page' ? (
        <>
          <header className="ttr-sp__header">
            <div className="ttr-sp__bar">
              <div className="ttr-sp__lockup">
                <a className="ttr-sp__brand" href={homeHref}>
                  <img alt="" height={28} src={logoSrc} width={28} />
                  <span>Tuturuuu</span>
                </a>
                {appName && appHref ? (
                  <a className="ttr-sp__app" href={appHref}>
                    {appName}
                  </a>
                ) : null}
              </div>
              <nav aria-label={copy.nav}>
                {searchHref ? (
                  <a className="ttr-sp__navlink" href={searchHref}>
                    {copy.search}
                  </a>
                ) : null}
                {helpHref ? (
                  <a className="ttr-sp__navlink" href={helpHref}>
                    {copy.help}
                  </a>
                ) : null}
                <a
                  className="ttr-sp__navlink"
                  data-wide-only=""
                  href={homeHref}
                >
                  {copy.home}
                </a>
              </nav>
            </div>
          </header>
          <main aria-labelledby={titleId} className="ttr-sp__main">
            {message}
          </main>
          <footer className="ttr-sp__footer">
            <div className="ttr-sp__bar">
              <span>Tuturuuu</span>
              <nav aria-label="Tuturuuu">
                <a href={`${TUTURUUU_HOME_URL}/privacy`}>{copy.privacy}</a>
                <a href={`${TUTURUUU_HOME_URL}/terms`}>{copy.terms}</a>
              </nav>
            </div>
          </footer>
        </>
      ) : (
        <section aria-labelledby={titleId} className="ttr-sp__main">
          {message}
        </section>
      )}
    </div>
  );
}
