import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '../legal-head';
import { LegalPage } from '../legal-page';

export const Route = createFileRoute('/en/legal/dpa')({
  head: () => legalHead('dpa', 'en'),
  component: () => <LegalPage kind="dpa" locale="en" />,
});
