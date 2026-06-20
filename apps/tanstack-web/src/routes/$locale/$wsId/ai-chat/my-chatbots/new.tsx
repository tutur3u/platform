import { createFileRoute } from '@tanstack/react-router';
import { NewChatbotForm } from '../../../../../components/ai-chat/new-chatbot-form';
import { createPageHead } from '../../../../../lib/platform/head';

export const Route = createFileRoute('/$locale/$wsId/ai-chat/my-chatbots/new')({
  component: NewChatbotRoute,
  head: () =>
    createPageHead({
      description:
        'Manage New in the My Chatbots area of your Tuturuuu workspace.',
      title: 'New',
    }),
});

function NewChatbotRoute() {
  const { locale } = Route.useParams() as { locale?: string };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col px-4 py-8">
      <NewChatbotForm locale={locale} />
    </main>
  );
}
