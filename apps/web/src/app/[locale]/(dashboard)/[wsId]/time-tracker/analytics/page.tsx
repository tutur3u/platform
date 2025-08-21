import Loading from '../loading';
import { AnalyticsContent } from './analytics-content';
import { Suspense } from 'react';

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AnalyticsContent />
    </Suspense>
  );
}
