import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { z } from 'zod';
import type { ContactLinkDatabase } from '@/lib/contact-account-link';
import { ContactLinkConfirmation } from './confirmation';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const ConfirmationSearch = z.object({
  wsId: z.guid(),
  contactId: z.guid(),
  invitationId: z.guid(),
});

const ConsentDetails = z.object({
  workspace: z.string().min(1),
  contact: z.string().min(1),
  inviter: z.string().min(1),
  expiresAt: z.iso.datetime({ offset: true }),
});

type ContactLinkPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ContactLinkPage(props: ContactLinkPageProps) {
  return (
    <Suspense>
      <ContactLinkContent {...props} />
    </Suspense>
  );
}

async function ContactLinkContent({
  params,
  searchParams,
}: ContactLinkPageProps) {
  await connection();
  const [{ locale }, search, t] = await Promise.all([
    params,
    searchParams,
    getTranslations('contact-link'),
  ]);
  const invitation = ConfirmationSearch.safeParse(search);
  let details: z.infer<typeof ConsentDetails> | undefined;
  if (invitation.success) {
    const supabase = await createClient();
    const { user } = await resolveAuthenticatedSessionUser(supabase);
    if (!user) {
      const callback = `/${locale}/contact-link?${new URLSearchParams(invitation.data)}`;
      redirect(`/${locale}/login?nextUrl=${encodeURIComponent(callback)}`);
    }

    const admin = await createAdminClient<ContactLinkDatabase>({
      noCookie: true,
      auditActorId: user.id,
    });
    const { data, error } = await admin
      .schema('private')
      .rpc('preview_contact_account_link', {
        p_ws_id: invitation.data.wsId,
        p_contact_id: invitation.data.contactId,
        p_invitation_id: invitation.data.invitationId,
        p_actor_id: user.id,
      });
    const preview = ConsentDetails.safeParse(data);
    if (!error && preview.success) details = preview.data;
  }

  return (
    <main className="mx-auto grid min-h-[60dvh] w-full max-w-lg place-items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {invitation.success && details ? (
            <ContactLinkConfirmation
              invitation={invitation.data}
              copy={{
                confirm: t('confirm'),
                confirming: t('confirming'),
                description: t('description', {
                  workspace: details.workspace,
                  contact: details.contact,
                  inviter: details.inviter,
                }),
                expires: t('expires', {
                  date: new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'UTC',
                  }).format(new Date(details.expiresAt)),
                }),
                decline: t('decline'),
                declined: t('declined'),
                linked: t('linked'),
                unavailable: t('unavailable'),
              }}
            />
          ) : (
            <p>{t('unavailable')}</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
