import { createFileRoute } from '@tanstack/react-router';
import { AboutPage } from '../../components/about/about-page';
import { createPageHead } from '../../lib/platform/head';
import { resolveMessagesLocale } from '../../lib/platform/messages';

export const Route = createFileRoute('/$locale/about')({
  component: AboutRoutePage,
  head: () =>
    createPageHead({
      description: 'Get to know the vision, story, and team behind Tuturuuu.',
      title: 'About Tuturuuu',
    }),
});

function AboutRoutePage() {
  const { locale } = Route.useParams();

  return <AboutPage locale={resolveMessagesLocale(locale)} />;
}
