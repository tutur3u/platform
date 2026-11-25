'use client';

import { useQuery } from '@tanstack/react-query';
import { readMeetMiraAccountConfirmation } from '@tuturuuu/internal-api/meet-call';

export const miraAccountConfirmationKey = (accountId: string) => [
  'meet-mira-account-confirmation',
  accountId,
];

export function useMiraAccountConfirmation(accountId: string) {
  return useQuery({
    queryKey: miraAccountConfirmationKey(accountId),
    queryFn: async ({ signal }) => {
      const account = await readMeetMiraAccountConfirmation(signal);
      if (account.accountId !== accountId)
        throw new Error('Mira account changed');
      return account.confirmed;
    },
    retry: false,
  });
}
