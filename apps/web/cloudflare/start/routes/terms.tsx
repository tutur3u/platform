import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '../legal-head';
import { LegalPage } from '../legal-page';

export const Route = createFileRoute('/terms')({
  head: () => legalHead('terms', 'en'),
  component: () => <LegalPage kind="terms" locale="en" />,
});
