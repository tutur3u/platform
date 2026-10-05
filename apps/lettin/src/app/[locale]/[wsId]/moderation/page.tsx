import { connection } from 'next/server';
import { Suspense } from 'react';
import { BlacklistManager } from '@/components/blacklist-manager';
import Loading from '../wiki/loading';

type PageProps = {
  params: Promise<{ wsId: string }>;
};

export default function Page(props: PageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <ModerationPage {...props} />
    </Suspense>
  );
}

async function ModerationPage({ params }: PageProps) {
  await connection();
  return <BlacklistManager wsId={(await params).wsId} />;
}
