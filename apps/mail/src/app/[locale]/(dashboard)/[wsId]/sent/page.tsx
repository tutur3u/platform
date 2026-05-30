import { renderMailFolderPage } from '../folder-page';

interface PageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function SentPage(props: PageProps) {
  return renderMailFolderPage(props, 'sent');
}
