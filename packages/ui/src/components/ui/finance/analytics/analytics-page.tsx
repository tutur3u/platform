'use client';

import { CategorySpendingChart } from './category-spending-chart';
import { SpendingTrendsChart } from './spending-trends-chart';

interface AnalyticsPageProps {
  wsId: string;
}

export default function AnalyticsPage({ wsId }: AnalyticsPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Financial Analytics</h1>
        <p className="text-muted-foreground text-sm">
          Insights into your spending patterns and financial trends
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SpendingTrendsChart wsId={wsId} />
        <CategorySpendingChart wsId={wsId} />
      </div>
    </div>
  );
}
