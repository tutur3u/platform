import { HomePage } from '@/components/learner-pages';

export default async function LearnerHomePage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <HomePage wsId={wsId} />;
}
