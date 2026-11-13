import { StatusPage } from '@tuturuuu/ui/custom/status-page';

/** Unknown paths and `notFound()`: the shared Tuturuuu status page (404). */
export default function NotFound() {
  return (
    <StatusPage
      appHref="/"
      appName="External"
      locale="en"
      variant="not-found"
    />
  );
}
