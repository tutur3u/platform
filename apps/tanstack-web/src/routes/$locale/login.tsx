import { createFileRoute } from '@tanstack/react-router';
import { LegacyNotFoundShell } from '../../components/route-shell';
import { createPageHead } from '../../lib/platform/head';

export const Route = createFileRoute('/$locale/login')({
  component: LegacyNotFoundShell,
  head: () =>
    createPageHead({
      description:
        'Access your Tuturuuu workspace and continue where you left off.',
      title: 'Sign In to Tuturuuu',
    }),
});
