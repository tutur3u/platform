import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '../legal-head';
import { LegalPage } from '../legal-page';

export const Route = createFileRoute('/vi/legal/sla')({
  head: () => legalHead('sla', 'vi'),
  component: () => <LegalPage kind="sla" locale="vi" />,
});
