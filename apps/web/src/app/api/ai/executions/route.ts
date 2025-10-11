import { AIExecutionAnalyticsService } from '@/app/[locale]/(dashboard)/[wsId]/ai/executions/services/analytics-service';
import { createPOST } from '@tuturuuu/ai/executions/route';

export const maxDuration = 90;
export const preferredRegion = 'sin1';
export const runtime = 'edge';

const POST = createPOST({
  getLast30DaysStats: AIExecutionAnalyticsService.getLast30DaysStats,
  getAllTimeStats: AIExecutionAnalyticsService.getAllTimeStats,
});

export { POST };
