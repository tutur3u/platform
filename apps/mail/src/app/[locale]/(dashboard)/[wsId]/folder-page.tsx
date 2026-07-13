import { redirect } from 'next/navigation';
import { DEFAULT_MAIL_FOLDER, getMailFolderHref } from './mail-folders';

interface MailFolderPageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export async function redirectToMailInbox({ params }: MailFolderPageProps) {
  const { wsId } = await params;
  redirect(getMailFolderHref(wsId, DEFAULT_MAIL_FOLDER));
}
