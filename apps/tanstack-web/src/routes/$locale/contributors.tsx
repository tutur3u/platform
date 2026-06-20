import { createFileRoute } from '@tanstack/react-router';
import { ContributorsPage } from '../../components/contributors/contributors-page';
import { createPageHead } from '../../lib/platform/head';

export const Route = createFileRoute('/$locale/contributors')({
  component: ContributorsRoutePage,
  head: () =>
    createPageHead({
      description: 'Meet the people who make Tuturuuu possible.',
      title: 'Contributors',
    }),
});

function ContributorsRoutePage() {
  return <ContributorsPage />;
}
