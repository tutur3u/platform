import { createFileRoute } from '@tanstack/react-router';
import {
  getMeetTogetherContent,
  MeetTogetherPage,
} from '../../components/meet-together';
import { createPageHead } from '../../lib/platform/head';
import { resolveMessagesLocale } from '../../lib/platform/messages';

export const Route = createFileRoute('/$locale/meet')({
  component: MeetRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);
    const content = getMeetTogetherContent(locale);

    return createPageHead({
      description: content.meta.description,
      locale,
      title: content.meta.title,
    });
  },
});

function MeetRoutePage() {
  const { locale } = Route.useParams() as { locale: string };

  return <MeetTogetherPage locale={resolveMessagesLocale(locale)} />;
}
