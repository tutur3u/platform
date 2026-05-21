import type { Metadata } from 'next';
import { redirectToFinanceApp } from '../redirect';

export const metadata: Metadata = {
  title: 'Recurring Transactions',
  description:
    'Manage recurring Finance transactions in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkspaceRecurringPage({
  params,
  searchParams,
}: Props) {
  return redirectToFinanceApp({
    params,
    path: 'recurring',
    searchParams,
  });
}
