import { createFileRoute } from '@tanstack/react-router';
import { LegacyNotFoundShell } from '../../components/route-shell';
import { createPageHead } from '../../lib/platform/head';

export const Route = createFileRoute('/$locale/logout')({
  component: LegacyNotFoundShell,
  head: () =>
    createPageHead({
      description: 'Log out of your Tuturuuu account.',
      title: 'Log Out',
    }),
});
