import type { Metadata } from 'next';
import {
  type FinanceRedirectSearchParams,
  redirectToFinanceApp,
} from '../redirect';

export const metadata: Metadata = {
  title: 'Finance',
  description: 'Manage Finance in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<FinanceRedirectSearchParams>;
}

export default async function WorkspaceFinancePage({
  params,
  searchParams,
}: Props) {
  return redirectToFinanceApp({ params, searchParams });
}
