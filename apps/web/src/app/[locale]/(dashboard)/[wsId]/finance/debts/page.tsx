import type { Metadata } from 'next';
import { redirectToFinanceApp } from '../redirect';

export const metadata: Metadata = {
  title: 'Finance Debts',
  description: 'Manage Finance debts and loans in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkspaceDebtsPage({
  params,
  searchParams,
}: Props) {
  return redirectToFinanceApp({
    params,
    path: 'debts',
    searchParams,
  });
}
