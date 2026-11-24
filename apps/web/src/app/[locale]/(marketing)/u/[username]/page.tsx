import { PublicProfileCard } from '@tuturuuu/ui/custom/public-profile-card';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { readPublicUserProfile } from '@/lib/public-user-profile';

type Props = { params: Promise<{ locale: Locale; username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const { locale, username } = await params;
  const profile = await readPublicUserProfile(username);
  const t = await getTranslations({ locale, namespace: 'public_profile' });
  return {
    title: profile?.display_name || t('title'),
    description: profile?.bio || t('description'),
    robots: { index: false, follow: false },
  };
}

async function Profile({ params }: Props) {
  await connection();
  const { locale, username } = await params;
  const profile = await readPublicUserProfile(username);
  if (!profile) notFound();
  const t = await getTranslations({ locale, namespace: 'public_profile' });
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-8">
      <PublicProfileCard
        profile={profile}
        username={username}
        labels={{
          title: t('title'),
          copyLink: t('copyLink'),
          linkCopied: t('linkCopied'),
          copyFailed: t('copyFailed'),
          manualCopyLink: t('manualCopyLink'),
        }}
      />
    </main>
  );
}

export default function Page(props: Props) {
  return (
    <Suspense
      fallback={
        <div
          className="mx-auto my-12 h-80 w-full max-w-4xl animate-pulse rounded-2xl bg-muted"
          aria-busy="true"
        />
      }
    >
      <Profile {...props} />
    </Suspense>
  );
}
