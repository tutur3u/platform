import { createFileRoute } from '@tanstack/react-router';
import { ContributorsPage } from '../../components/contributors/contributors-page';
import { contributorsQuery } from '../../components/contributors/github';
import type { ContributorsData } from '../../components/contributors/types';
import { createPageHead } from '../../lib/platform/head';

export const Route = createFileRoute('/$locale/contributors')({
  component: ContributorsRoutePage,
  head: () =>
    createPageHead({
      description: 'Meet the people who make Tuturuuu possible.',
      title: 'Contributors',
    }),
  loader: async ({ context }) =>
    context.queryClient.ensureQueryData(contributorsQuery),
});

function ContributorsRoutePage() {
  const initialData = Route.useLoaderData() as ContributorsData;

  return <ContributorsPage initialData={initialData} />;
}
