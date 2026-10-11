import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { CreatorBookmark } from './creator-bookmark';
export async function ReaderCreatorBookmark({
  creatorId,
}: {
  creatorId: string;
}) {
  await connection();
  const user = await getSatelliteAppSessionUser('lettin');
  const t = await getTranslations('lettin');
  return (
    <div className="mx-auto max-w-5xl space-y-3 px-5 py-6">
      <p>{t('savedCreatorsHint')}</p>
      {user ? (
        <CreatorBookmark
          key={`${user.id}:${creatorId}`}
          actorId={user.id}
          creatorId={creatorId}
        />
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(`/creators/${creatorId}`)}`}
        >
          {t('signInToSaveCreator')}
        </Link>
      )}
      <Link href="/saved">{t('savedLibrary')}</Link>
    </div>
  );
}
