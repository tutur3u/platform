import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BasicTokenVerifier } from './client';

export const metadata: Metadata = {
  title: 'Verify Token',
  description: 'Access Verify Token flows for your Tuturuuu account.',
};

export default function VerifyTokenPage() {
  return (
    <Suspense>
      <BasicTokenVerifier />
    </Suspense>
  );
}
