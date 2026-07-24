import { redirect } from 'next/navigation';
import { connection } from 'next/server';

interface Props {
  params: Promise<{ boardId: string; wsId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LegacyBoardTaskPage({
  params,
  searchParams,
}: Props) {
  await connection();
  const [{ boardId, wsId }, query] = await Promise.all([params, searchParams]);
  const nextQuery = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const entry of value) nextQuery.append(key, entry);
    } else if (value !== undefined) {
      nextQuery.set(key, value);
    }
  }

  const queryString = nextQuery.toString();
  redirect(`/${wsId}/boards/${boardId}${queryString ? `?${queryString}` : ''}`);
}
