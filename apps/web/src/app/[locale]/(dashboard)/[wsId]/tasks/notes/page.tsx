import NotesPage from '@tuturuuu/ui/tu-do/notes/notes-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Notes',
  description: 'Capture quick notes and ideas in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <NotesPage params={params} />;
}
