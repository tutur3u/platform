import { createFileRoute } from '@tanstack/react-router';
import { securityHead } from '../security-head';
import { SecurityPage } from '../security-page';

export const Route = createFileRoute('/en/security/policy')({
  head: () => securityHead('security-policy', 'en'),
  component: () => <SecurityPage kind="security-policy" locale="en" />,
});
