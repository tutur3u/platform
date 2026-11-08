import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '../legal-head';
import { LegalPage } from '../legal-page';

export const Route = createFileRoute('/en/acceptable-use')({
  head: () => legalHead('acceptable-use', 'en'),
  component: () => <LegalPage kind="acceptable-use" locale="en" />,
});
