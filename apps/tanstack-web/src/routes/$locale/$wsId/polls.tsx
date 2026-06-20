import { createFileRoute } from '@tanstack/react-router';
import { PollsPage } from '../../../components/polls/polls-page';
import { createPageHead } from '../../../lib/platform/head';
import {
  getMessages,
  resolveMessagesLocale,
} from '../../../lib/platform/messages';

export const Route = createFileRoute('/$locale/$wsId/polls')({
  component: PollsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage Polls in your Tuturuuu workspace.',
      locale,
      title: 'Polls',
    });
  },
});

function PollsRoutePage() {
  const { locale } = Route.useParams();

  return <PollsPage messages={getMessages(locale)} />;
}
