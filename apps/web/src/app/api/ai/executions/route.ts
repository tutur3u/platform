import { createPOST } from '@tuturuuu/ai/executions/route';
import { AIExecutionAnalyticsService } from '@/app/[locale]/(dashboard)/[wsId]/ai/executions/services/analytics-service';

export const config = {
  maxDuration: 90,
  preferredRegion: 'sin1',
  runtime: 'edge',
};

const POST = createPOST({
  getLast30DaysStats: AIExecutionAnalyticsService.getLast30DaysStats,
  getAllTimeStats: AIExecutionAnalyticsService.getAllTimeStats,
});

export { POST };
