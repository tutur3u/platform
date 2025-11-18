import { Suspense } from 'react';
import ServerPage from './server-page';

interface RedirectPageProps {
  params: Promise<{ slug: string }>;
}

export default async function RedirectPage({ params }: RedirectPageProps) {
  return (
    <Suspense>
      <ServerPage params={params} />
    </Suspense>
  );
}
