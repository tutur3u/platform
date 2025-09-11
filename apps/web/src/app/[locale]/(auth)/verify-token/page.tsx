import { Suspense } from 'react';
import { BasicTokenVerifier } from './client';

export default function VerifyTokenPage() {
  return (
    <Suspense>
      <BasicTokenVerifier />
    </Suspense>
  );
}
