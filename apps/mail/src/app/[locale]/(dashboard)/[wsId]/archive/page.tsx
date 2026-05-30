import { renderMailFolderPage } from '../folder-page';

interface PageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function ArchivePage(props: PageProps) {
  return renderMailFolderPage(props, 'archive');
}
