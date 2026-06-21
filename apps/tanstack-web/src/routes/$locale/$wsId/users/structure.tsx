import { createFileRoute } from '@tanstack/react-router';
import { OrganizationalStructureDashboard } from '../../../../components/users/structure/components/organizational-structure-dashboard';
import { createPageHead } from '../../../../lib/platform/head';
import {
  getMessages,
  resolveMessagesLocale,
} from '../../../../lib/platform/messages';

export const Route = createFileRoute('/$locale/$wsId/users/structure')({
  component: OrganizationalStructureRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Structure in the Users area of your Tuturuuu workspace.',
      locale,
      title: 'Structure',
    });
  },
});

function OrganizationalStructureRoutePage() {
  const { locale } = Route.useParams();

  return (
    <OrganizationalStructureDashboard
      messages={getMessages(locale).organizational_structure}
    />
  );
}
