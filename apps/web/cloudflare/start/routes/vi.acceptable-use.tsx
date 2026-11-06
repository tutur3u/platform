import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '../legal-head';
import { LegalPage } from '../legal-page';

export const Route = createFileRoute('/vi/acceptable-use')({
  head: () => legalHead('acceptable-use', 'vi'),
  component: () => <LegalPage kind="acceptable-use" locale="vi" />,
});
