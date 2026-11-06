import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '../legal-head';
import { LegalPage } from '../legal-page';

export const Route = createFileRoute('/privacy')({
  head: () => legalHead('privacy', 'en'),
  component: () => <LegalPage kind="privacy" locale="en" />,
});
