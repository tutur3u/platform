import { type JSX, Suspense } from 'react';
import { AddAccountContent, AddAccountFallback } from './AddAccountClient';

export default function AddAccountPage(): JSX.Element {
  return (
    <Suspense fallback={<AddAccountFallback />}>
      <AddAccountContent />
    </Suspense>
  );
}
