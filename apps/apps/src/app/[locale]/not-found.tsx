import { StatusPage } from '@tuturuuu/ui/custom/status-page';
import { useLocale } from 'next-intl';

/** `notFound()` under a locale: the shared Tuturuuu status page (404). */
export default function NotFound() {
  return (
    <StatusPage
      appHref="/"
      appName="Apps"
      locale={useLocale()}
      variant="not-found"
    />
  );
}
