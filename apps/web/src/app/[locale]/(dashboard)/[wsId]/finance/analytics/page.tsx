import type { Metadata } from 'next';
import { redirectToFinanceApp } from '../redirect';

export const metadata: Metadata = {
  title: 'Finance Analytics',
  description: 'Review Finance analytics in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkspaceAnalyticsPage({
  params,
  searchParams,
}: Props) {
  return redirectToFinanceApp({
    params,
    path: 'analytics',
    searchParams,
  });
}
