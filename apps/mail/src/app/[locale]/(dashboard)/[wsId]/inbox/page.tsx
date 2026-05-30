import { renderMailFolderPage } from '../folder-page';

interface PageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function InboxPage(props: PageProps) {
  return renderMailFolderPage(props, 'inbox');
}
