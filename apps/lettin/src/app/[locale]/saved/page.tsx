import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Brand } from '@/components/brand';
import { SavedCreators } from '@/components/saved-creators';
import { SavedNotebooks } from '@/components/saved-notebooks';
export const metadata = { robots: { index: false, follow: false } };
export default function Page() {
  return (
    <div className="notebook-theme min-h-screen">
      <Brand />
      <Suspense>
        <Library />
      </Suspense>
    </div>
  );
}
async function Library() {
  await connection();
  const user = await getSatelliteAppSessionUser('lettin');
  if (!user) redirect('/login?next=%2Fsaved');
  return (
    <>
      <SavedNotebooks key={user.id} actorId={user.id} />
      <SavedCreators key={`creators-${user.id}`} actorId={user.id} />
    </>
  );
}
