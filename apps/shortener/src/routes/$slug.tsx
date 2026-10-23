import { createFileRoute } from '@tanstack/react-router';
import { LinkStatusPage } from '../components/link-status-page';
import PasswordForm from '../components/password-form';
import { loadShortLinkPage } from '../native/page-data';

export const Route = createFileRoute('/$slug')({
  loader: () => loadShortLinkPage(),
  component: ShortLinkPageView,
});

function ShortLinkPageView() {
  const page = Route.useLoaderData();
  if (page.kind === 'password')
    return (
      <PasswordForm linkId={page.linkId} slug={page.slug} hint={page.hint} />
    );
  return <LinkStatusPage kind={page.kind} />;
}
