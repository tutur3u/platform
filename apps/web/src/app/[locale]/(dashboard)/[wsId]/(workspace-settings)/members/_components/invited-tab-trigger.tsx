'use client';

import { TabsTrigger } from '@ncthub/ui/tabs';
import { useRouter } from 'next/navigation';

interface Props {
  wsId: string;
  label: string;
}

export default function InvitedTabTrigger({ wsId, label }: Props) {
  const router = useRouter();

  return (
    <TabsTrigger
      value="invited"
      onClick={() => router.push(`/${wsId}/members/invitations`)}
    >
      {label}
    </TabsTrigger>
  );
}
