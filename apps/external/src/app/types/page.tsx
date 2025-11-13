import { Suspense } from 'react';
import TypesPage from './client-page';

export default function Page() {
  return (
    <Suspense>
      <TypesPage />
    </Suspense>
  );
}
