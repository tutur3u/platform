import type { Metadata } from 'next';
import { redirectToFinanceApp } from '../redirect';

export const metadata: Metadata = {
  title: 'Finance Categories',
  description:
    'Manage Finance categories in the Finance area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkspaceFinanceCategoriesPage({
  params,
  searchParams,
}: Props) {
  return redirectToFinanceApp({
    params,
    path: 'categories',
    searchParams,
  });
}
