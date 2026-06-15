import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { loadProfileLinkForPage } from '@/features/user-profile-links/public-loader';
import ProfileFillContent from './content';

interface PageProps {
  params: Promise<{ locale: string; code: string }>;
}

export const metadata: Metadata = {
  title: 'Complete your profile',
  robots: { index: false, follow: false },
};

export default async function SharedUserProfilePage({ params }: PageProps) {
  const { code } = await params;
  const t = await getTranslations('ws-user-profile-links');
  const { status, data } = await loadProfileLinkForPage(code);

  if (status === 401) {
    redirect(`/login?nextUrl=/shared/user-profile/${code}`);
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-background via-dynamic-blue/5 to-dynamic-purple/10 px-4">
        <div className="max-w-lg space-y-3 text-center">
          <h1 className="font-semibold text-3xl">
            {t('public_unavailable_title')}
          </h1>
          <p className="text-muted-foreground">
            {t('public_unavailable_description')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ProfileFillContent
      code={data.code}
      mode={data.mode}
      allowedFields={data.allowedFields}
      prefill={data.prefill}
      prefillExistingValues={data.prefillExistingValues}
      actorEmail={data.actorEmail}
    />
  );
}
