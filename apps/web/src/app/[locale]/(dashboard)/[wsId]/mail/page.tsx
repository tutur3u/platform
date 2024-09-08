import { Mail } from './_components/mail';
import { mails } from './data';
import { ROOT_WORKSPACE_ID } from '@/constants/common';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

interface Props {
  params: {
    wsId: string;
  };
}

export default function MailPage({ params: { wsId } }: Props) {
  if (wsId !== ROOT_WORKSPACE_ID) redirect(`/${wsId}/mail/history`);

  const layout = cookies().get('react-resizable-panels:layout:mail');
  const collapsed = cookies().get('react-resizable-panels:collapsed');

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
