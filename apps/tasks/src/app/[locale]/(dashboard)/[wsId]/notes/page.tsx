import NotesPage from '@tuturuuu/ui/tu-do/notes/notes-page';
import { connection } from 'next/server';
import { createElement } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  await connection();

  return createElement(NotesPage, { params });
}
