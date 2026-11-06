import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '../legal-head';
import { LegalPage } from '../legal-page';

export const Route = createFileRoute('/vi/legal/dpa')({
  head: () => legalHead('dpa', 'vi'),
  component: () => <LegalPage kind="dpa" locale="vi" />,
});
