import { Suspense } from 'react';
import Loading from '../loading';
import { ReportsContent } from './reports-content';

export default function ReportsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ReportsContent />
    </Suspense>
  );
}
