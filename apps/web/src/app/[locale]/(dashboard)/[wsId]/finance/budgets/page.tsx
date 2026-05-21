import type { Metadata } from 'next';
import { redirectToFinanceApp } from '../redirect';

export const metadata: Metadata = {
  title: 'Finance Budgets',
  description: 'Manage Finance budgets in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkspaceBudgetsPage({
  params,
  searchParams,
}: Props) {
  return redirectToFinanceApp({
    params,
    path: 'budgets',
    searchParams,
  });
}
