import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '../legal-head';
import { LegalPage } from '../legal-page';

export const Route = createFileRoute('/en/privacy')({
  head: () => legalHead('privacy', 'en'),
  component: () => <LegalPage kind="privacy" locale="en" />,
});
