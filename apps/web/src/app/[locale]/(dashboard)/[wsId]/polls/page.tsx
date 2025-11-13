import { Suspense } from 'react';
import PollsPage from './client-page';

export default function Page() {
  return (
    <Suspense>
      <PollsPage />
    </Suspense>
  );
}
