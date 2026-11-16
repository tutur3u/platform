'use client';

import { WorkspacePeoplePicker } from '@tuturuuu/ui/custom/workspace-people-picker';
import { useTranslations } from 'next-intl';

export function RecipientPeoplePicker({
  workspaceId,
  fieldLabel,
  excludedAddresses,
  onSelect,
}: {
  workspaceId: string;
  fieldLabel: string;
  excludedAddresses: readonly string[];
  onSelect: (recipient: { address: string; displayName: string | null }) => void;
}) {
  const t = useTranslations('mail.recipient_people');
  return (
    <div className="w-32 shrink-0">
      <WorkspacePeoplePicker
        workspaceId={workspaceId}
        emailRequired
        excludedEmails={excludedAddresses}
        labels={{
          trigger: t('trigger', { field: fieldLabel }),
          search: t('search'),
          minimumQuery: t('minimum_query'),
          loading: t('loading'),
          empty: t('empty'),
          error: t('error'),
          retry: t('retry'),
          contact: t('contact'),
          member: t('member'),
        }}
        onSelect={(person) => {
          const address = person.email?.trim().toLowerCase();
          if (
            !address ||
            !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(address) ||
            excludedAddresses.some((value) => value.trim().toLowerCase() === address)
          ) return;
          onSelect({ address, displayName: person.displayName });
        }}
      />
    </div>
  );
}
