import { renderMailFolderPage } from '../folder-page';

interface PageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function SpamPage(props: PageProps) {
  return renderMailFolderPage(props, 'spam');
}
