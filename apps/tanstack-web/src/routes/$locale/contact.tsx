import { queryOptions, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  createBackendSupportInquiry,
  getBackendCurrentUserProfile,
  InternalApiError,
  withForwardedBackendApiAuth,
} from '@tuturuuu/internal-api';
import { ContactPage } from '../../components/contact/contact-page';
import type {
  ContactFormValues,
  ContactInquirySubmissionResult,
  ContactProfile,
} from '../../data/contact/contact-form';
import { withTanstackBackendRuntime } from '../../lib/cloudflare/backend';
import { createPageHead } from '../../lib/platform/head';
import { resolveMessagesLocale } from '../../lib/platform/messages';

const getCurrentUserContactProfile = createServerFn({
  method: 'GET',
}).handler(async (): Promise<ContactProfile | null> => {
  try {
    const backendRuntime = await withTanstackBackendRuntime();
    const profile = await getBackendCurrentUserProfile(
      withForwardedBackendApiAuth(getRequestHeaders(), backendRuntime)
    );

    return {
      display_name: profile.display_name,
      email: profile.email,
      id: profile.id,
    };
  } catch (error) {
    if (error instanceof InternalApiError && error.status === 401) {
      return null;
    }

    throw error;
  }
});

const createContactInquiry = createServerFn({ method: 'POST' })
  .validator((data: ContactFormValues) => data)
  .handler(async ({ data }): Promise<ContactInquirySubmissionResult> => {
    try {
      const backendRuntime = await withTanstackBackendRuntime();
      const response = await createBackendSupportInquiry(
        data,
        withForwardedBackendApiAuth(getRequestHeaders(), backendRuntime)
      );

      return {
        inquiryId: response.inquiryId,
        ok: true,
      };
    } catch (error) {
      if (error instanceof InternalApiError) {
        return {
          code: error.code,
          message: error.message,
          ok: false,
          status: error.status,
        };
      }

      throw error;
    }
  });

const currentUserContactProfileQuery = queryOptions({
  queryFn: () => getCurrentUserContactProfile(),
  queryKey: ['contact', 'current-user-profile'],
  retry: false,
});

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
  loader: async ({ context }) =>
    context.queryClient.ensureQueryData(currentUserContactProfileQuery),
});

function ContactRoutePage() {
  const { locale } = Route.useParams();
  const initialProfile = Route.useLoaderData();
  const profileQuery = useQuery({
    ...currentUserContactProfileQuery,
    initialData: initialProfile,
  });

  return (
    <ContactPage
      isProfilePending={profileQuery.isPending}
      locale={resolveMessagesLocale(locale)}
      profile={profileQuery.data ?? null}
      submitInquiry={(values) => createContactInquiry({ data: values })}
    />
  );
}
