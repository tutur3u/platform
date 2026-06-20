import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePlaceholderPage } from '../../../components/workspace-placeholder/workspace-placeholder-page';
import { createPageHead } from '../../../lib/platform/head';
import {
  getMessages,
  resolveMessagesLocale,
} from '../../../lib/platform/messages';

export const Route = createFileRoute('/$locale/$wsId/workouts')({
  component: WorkoutsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage Workouts in your Tuturuuu workspace.',
      locale,
      title: 'Workouts',
    });
  },
});

function WorkoutsRoutePage() {
  const { locale } = Route.useParams();

  return <WorkspacePlaceholderPage messages={getMessages(locale)} />;
}
