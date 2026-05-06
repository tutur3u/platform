import { LearnerAiChat } from '@/components/ai-chat/learner-ai-chat';

export default async function AiChatPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;

  return <LearnerAiChat wsId={wsId} />;
}
