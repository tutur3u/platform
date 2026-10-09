import { UserRound } from '@tuturuuu/icons';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import {
  publicProfileImage,
  readPublicUserProfile,
} from '@/lib/public-user-profile';

type Props = { params: Promise<{ locale: string; username: string }> };

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
  const avatar = publicProfileImage(profile.avatar_url);
  const banner = publicProfileImage(profile.banner_url);
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-8">
      <article className="overflow-hidden rounded-2xl border bg-card">
        <div className="h-48 bg-muted sm:h-64">
          {banner && (
            /* biome-ignore lint/performance/noImgElement: User media is externally hosted and revocable. */
            <img
              src={banner}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
        <div className="relative space-y-5 px-6 pb-8 sm:px-10">
          <div className="-mt-12 flex size-24 items-center justify-center overflow-hidden rounded-full border-4 border-card bg-muted">
            {avatar ? (
              /* biome-ignore lint/performance/noImgElement: User media is externally hosted and revocable. */
              <img
                src={avatar}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <UserRound
                className="size-10 text-muted-foreground"
                aria-hidden="true"
              />
            )}
          </div>
          <h1 className="break-words font-semibold text-3xl">
            {profile.display_name || t('title')}
          </h1>
          {profile.bio && (
            <p className="whitespace-pre-wrap break-words text-muted-foreground">
              {profile.bio}
            </p>
          )}
        </div>
      </article>
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
