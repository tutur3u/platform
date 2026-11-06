import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '../legal-head';
import { LegalPage } from '../legal-page';

export const Route = createFileRoute('/en/legal/subprocessors')({
  head: () => legalHead('subprocessors', 'en'),
  component: () => <LegalPage kind="subprocessors" locale="en" />,
});
