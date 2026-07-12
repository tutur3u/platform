import { type JSX, Suspense } from 'react';
import { AddAccountContent, AddAccountFallback } from './AddAccountClient';

export default async function AddAccountPage(): Promise<JSX.Element> {
  return (
    <Suspense fallback={<AddAccountFallback />}>
      <AddAccountContent />
    </Suspense>
  );
}
