import { createFileRoute } from '@tanstack/react-router';
import { ContactPage } from '../../components/contact/contact-page';
import { createPageHead } from '../../lib/platform/head';
import { resolveMessagesLocale } from '../../lib/platform/messages';

export const Route = createFileRoute('/$locale/contact')({
  component: ContactRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Reach out to the Tuturuuu team for support, partnerships, or general questions.',
      locale,
      title: 'Contact Tuturuuu',
    });
  },
});

function ContactRoutePage() {
  const { locale } = Route.useParams();

  return <ContactPage locale={resolveMessagesLocale(locale)} />;
}
