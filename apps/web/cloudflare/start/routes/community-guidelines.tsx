import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '../legal-head';
import { LegalPage } from '../legal-page';

export const Route = createFileRoute('/community-guidelines')({
  head: () => legalHead('community-guidelines', 'en'),
  component: () => <LegalPage kind="community-guidelines" locale="en" />,
});
