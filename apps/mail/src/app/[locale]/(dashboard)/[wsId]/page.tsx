import { redirectToMailInbox } from './folder-page';

interface PageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function MailPage(props: PageProps) {
  await redirectToMailInbox(props);
}
