import { permanentRedirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceQuizSetsLegacyRedirectPage({
  params,
}: Props) {
  const { wsId } = await params;
  permanentRedirect(`/${wsId}/education/library/quiz-sets`);
}
