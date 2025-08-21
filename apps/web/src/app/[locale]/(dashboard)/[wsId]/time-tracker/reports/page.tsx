import Loading from '../loading';
import { ReportsContent } from './reports-content';
import { Suspense } from 'react';

export default function ReportsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ReportsContent />
    </Suspense>
  );
}
