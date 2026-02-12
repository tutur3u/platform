import NotesPage from '@tuturuuu/ui/tu-do/notes/notes-page';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <NotesPage params={params} />;
}
