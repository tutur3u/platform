'use client';

import { Tabs, TabsList } from '@/components/ui/tabs';
import JoinedTabTrigger from './joined-tab-trigger';
import InvitedTabTrigger from './invited-tab-trigger';
import { usePathname } from 'next/navigation';

interface Props {
  wsId: string;
  joinedLabel: string;
  invitedLabel: string;
}

export default function MemberTabs({ wsId, joinedLabel, invitedLabel }: Props) {
  const pathname = usePathname();
  const isInvitedTab = pathname?.includes('invitations');

  return (
    <Tabs value={isInvitedTab ? 'invited' : 'joined'}>
      <TabsList>
        <JoinedTabTrigger wsId={wsId} label={joinedLabel} />
        <InvitedTabTrigger wsId={wsId} label={invitedLabel} />
      </TabsList>
    </Tabs>
  );
}
