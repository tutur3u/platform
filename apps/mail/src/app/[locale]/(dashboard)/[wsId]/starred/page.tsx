import { renderMailFolderPage } from '../folder-page';

interface PageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function StarredPage(props: PageProps) {
  return renderMailFolderPage(props, 'starred');
}
