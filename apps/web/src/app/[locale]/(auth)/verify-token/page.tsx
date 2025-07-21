import { BasicTokenVerifier } from './client';
import { Suspense } from 'react';

export default function VerifyTokenPage() {
  return (
    <Suspense>
      <BasicTokenVerifier />
    </Suspense>
  );
}
