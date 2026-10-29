import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ParentInviteAccept } from '@/components/parent-invite-accept';

// The invite token travels in the query string; keep it out of Referer headers.
export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: NO_INDEX_ROBOTS,
};

export default function ParentInvitePage() {
  return (
    <Suspense fallback={null}>
      <ParentInviteAccept />
    </Suspense>
  );
}
