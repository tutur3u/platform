import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '../legal-head';
import { LegalPage } from '../legal-page';

export const Route = createFileRoute('/en/legal/sla')({
  head: () => legalHead('sla', 'en'),
  component: () => <LegalPage kind="sla" locale="en" />,
});
