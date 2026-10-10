import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { NotebookBookmark } from './notebook-bookmark';
export async function ReaderBookmark({ worldId }: { worldId: string }) {
  await connection();
  const user = await getSatelliteAppSessionUser('lettin');
  const t = await getTranslations('lettin');
  return (
    <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-3 px-5 pt-6 md:px-10">
      {user ? (
        <NotebookBookmark key={user.id} worldId={worldId} actorId={user.id} />
      ) : (
        <Link href={`/login?next=${encodeURIComponent(`/worlds/${worldId}`)}`}>
          {t('signInToSave')}
        </Link>
      )}
      <Link href="/saved">{t('savedNotebooks')}</Link>
    </div>
  );
}
