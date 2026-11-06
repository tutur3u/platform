import { createFileRoute } from '@tanstack/react-router';
import { securityHead } from '../security-head';
import { SecurityPage } from '../security-page';

export const Route = createFileRoute('/en/security/bug-bounty')({
  head: () => securityHead('bug-bounty', 'en'),
  component: () => <SecurityPage kind="bug-bounty" locale="en" />,
});
