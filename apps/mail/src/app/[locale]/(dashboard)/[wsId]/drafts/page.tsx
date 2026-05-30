import { renderMailFolderPage } from '../folder-page';

interface PageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function DraftsPage(props: PageProps) {
  return renderMailFolderPage(props, 'drafts');
}
