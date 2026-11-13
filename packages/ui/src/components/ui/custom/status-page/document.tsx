import { resolveStatusPageLocale, STATUS_PAGE_COPY } from './copy';
import { StatusPage, type StatusPageProps } from './status-page';

/**
 * A whole HTML document around {@link StatusPage}, for boundaries that own
 * `<html>` (Next `global-error`) and for Worker responses rendered with
 * `react-dom/server`. No scripts: the theme comes from CSS alone.
 */
export function StatusPageDocument(props: StatusPageProps) {
  const lang = resolveStatusPageLocale(props.locale);
  const copy = STATUS_PAGE_COPY[lang][props.variant];
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <meta content="light dark" name="color-scheme" />
        <meta content="noindex" name="robots" />
        <title>{copy.documentTitle}</title>
      </head>
      <body style={{ margin: 0 }}>
        <StatusPage {...props} chrome="page" locale={lang} />
      </body>
    </html>
  );
}
