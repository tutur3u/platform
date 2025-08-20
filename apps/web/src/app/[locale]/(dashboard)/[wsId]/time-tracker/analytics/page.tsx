import { Suspense } from 'react';
import Loading from '../loading';
import { AnalyticsContent } from './analytics-content';

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AnalyticsContent />
    </Suspense>
  );
}
