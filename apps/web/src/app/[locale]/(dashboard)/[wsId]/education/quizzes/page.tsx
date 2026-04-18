import { permanentRedirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceQuizzesLegacyRedirectPage({
  params,
}: Props) {
  const { wsId } = await params;
  permanentRedirect(`/${wsId}/education/library/quizzes`);
}
