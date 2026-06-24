import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import {
  AddAccountFallback,
  AddAccountPage,
} from '@/components/auth/add-account/add-account-page';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';

type AddAccountSearch = {
  returnUrl: string | null;
};

export const Route = createFileRoute('/$locale/add-account')({
  component: AddAccountRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Add the current browser session to the account switcher.',
      locale,
      title: 'Add Account',
    });
  },
  validateSearch: (search: Record<string, unknown>): AddAccountSearch => ({
    returnUrl:
      typeof search.returnUrl === 'string' && search.returnUrl.trim()
        ? search.returnUrl
        : null,
  }),
});

function AddAccountRoute() {
  const { locale } = Route.useParams();
  const { returnUrl } = Route.useSearch();

  return (
    <Suspense fallback={<AddAccountFallback />}>
      <AddAccountPage locale={locale} returnUrl={returnUrl} />
    </Suspense>
  );
}
