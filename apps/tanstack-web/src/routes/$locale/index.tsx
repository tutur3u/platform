import { createFileRoute } from '@tanstack/react-router';
import { getLandingContent, LandingPage } from '../../components/landing';
import { createPageHead } from '../../lib/platform/head';
import { resolveMessagesLocale } from '../../lib/platform/messages';

export const Route = createFileRoute('/$locale/')({
  component: LandingRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);
    const content = getLandingContent(locale);

    return createPageHead({
      description: content.meta.description,
      locale,
      title: content.meta.title,
    });
  },
});

function LandingRoutePage() {
  const { locale } = Route.useParams();

  return <LandingPage locale={resolveMessagesLocale(locale)} />;
}
