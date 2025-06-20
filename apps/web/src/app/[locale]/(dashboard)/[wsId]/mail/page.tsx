import { Mail } from './_components/mail';
import { mails } from './data';
import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function MailPage({ params }: Props) {
  const { wsId } = await params;
  if (wsId !== ROOT_WORKSPACE_ID) redirect(`/${wsId}/mail/history`);

  const layout = (await cookies()).get('react-resizable-panels:layout:mail');
  const collapsed = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE_NAME);

  const defaultLayout = layout ? JSON.parse(layout.value) : undefined;
  const defaultCollapsed = collapsed ? JSON.parse(collapsed.value) : undefined;

  return (
    <div className="flex flex-col rounded-lg border">
      <Mail
        mails={mails}
        defaultLayout={defaultLayout}
        defaultCollapsed={defaultCollapsed}
        navCollapsedSize={4}
      />
    </div>
  );
}
