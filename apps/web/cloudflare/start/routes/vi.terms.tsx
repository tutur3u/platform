import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '../legal-head';
import { LegalPage } from '../legal-page';

export const Route = createFileRoute('/vi/terms')({
  head: () => legalHead('terms', 'vi'),
  component: () => <LegalPage kind="terms" locale="vi" />,
});
