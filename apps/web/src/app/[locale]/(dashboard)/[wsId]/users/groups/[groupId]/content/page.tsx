import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTeachAppOrigin } from '@/lib/teach-app-url';

export const metadata: Metadata = {
  title: 'Group Content Builder',
  description: 'Build and publish course modules within your user group.',
};

interface Props {
  params: Promise<{
    groupId: string;
    wsId: string;
  }>;
}

// The course builder (and its storage integration) now lives in apps/teach.
// This route is a redirect-only compatibility shim to the canonical Teach
// education builder URL.
export default async function GroupContentPage({ params }: Props) {
  const { wsId, groupId } = await params;
  redirect(
    `${getTeachAppOrigin()}/${wsId}/education/courses/${groupId}/builder`
  );
}
