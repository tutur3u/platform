import TokenVerifier from './client';
import { Suspense } from 'react';

export default function VerifyTokenPage() {
  return (
    <Suspense>
      <TokenVerifier />
    </Suspense>
  );
}
