import { createFileRoute } from '@tanstack/react-router';
import { getRandomGeneratorMessages } from '../../../components/tools/random/random-generator-messages';
import { RandomGeneratorPage } from '../../../components/tools/random/random-generator-page';
import { createPageHead } from '../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../lib/platform/messages';

type RandomGeneratorRouteParams = {
  locale?: string;
};

export const Route = createFileRoute('/$locale/tools/random')({
  component: RandomGeneratorRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(
      (params as RandomGeneratorRouteParams).locale
    );
    const messages = getRandomGeneratorMessages(locale);

    return createPageHead({
      description: messages.meta.description,
      locale,
      title: messages.meta.title,
    });
  },
});

function RandomGeneratorRoutePage() {
  const { locale } = Route.useParams() as RandomGeneratorRouteParams;
  const messages = getRandomGeneratorMessages(locale);

  return <RandomGeneratorPage messages={messages} />;
}
