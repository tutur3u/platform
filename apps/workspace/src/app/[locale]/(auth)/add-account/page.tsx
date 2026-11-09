import { connection } from 'next/server';
import { type JSX, Suspense } from 'react';
import { AddAccountContent, AddAccountFallback } from './AddAccountClient';

export async function AddAccountRuntime(): Promise<JSX.Element> {
  await connection();
  return <AddAccountContent />;
}

export default function AddAccountPage(): JSX.Element {
  return (
    <Suspense fallback={<AddAccountFallback />}>
      <AddAccountRuntime />
    </Suspense>
  );
}
