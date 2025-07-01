import { cookies } from 'next/headers';
import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';
import MailClientWrapper from './client';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function MailPage({ params }: Props) {
  const { wsId } = await params;

  // Read layout preferences for resizable panels & sidebar state
  const layoutCookie = (await cookies()).get(
    'react-resizable-panels:layout:mail'
  );
  const collapsedCookie = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE_NAME);

  const defaultLayout = layoutCookie
    ? JSON.parse(layoutCookie.value)
    : undefined;
  const defaultCollapsed = collapsedCookie
    ? JSON.parse(collapsedCookie.value)
    : undefined;

  return (
    <MailClientWrapper
      wsId={wsId}
      defaultLayout={defaultLayout}
      defaultCollapsed={defaultCollapsed}
    />
  );
}
