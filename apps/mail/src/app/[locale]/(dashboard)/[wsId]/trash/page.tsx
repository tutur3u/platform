import { renderMailFolderPage } from '../folder-page';

interface PageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function TrashPage(props: PageProps) {
  return renderMailFolderPage(props, 'trash');
}
