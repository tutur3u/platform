import { createAdminClient } from '@tuturuuu/supabase/next/server';

export interface AIExecutionSummary {
  total_executions: number;
  total_cost_usd: number;
  total_cost_vnd: number;
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_reasoning_tokens: number;
  avg_cost_per_execution: number;
  avg_tokens_per_execution: number;
}

export interface AIExecutionDailyStats {
  date: string;
  executions: number;
  total_cost_usd: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
}

export interface AIExecutionModelStats {
  model_id: string;
  executions: number;
  total_cost_usd: number;
  total_tokens: number;
  avg_cost_per_execution: number;
  avg_tokens_per_execution: number;
  percentage_of_total: number;
}

export interface AIExecutionMonthlyCost {
  total_cost_usd: number;
  total_cost_vnd: number;
  executions: number;
  avg_daily_cost: number;
}

type AIPricing = Record<
  string,
  {
    per1MInputTokens: number;
    per1MOutputTokens: number;
    per1MReasoningTokens: number;
  }
>;

type PricingOptions = {
  pricing?: AIPricing;
  exchangeRate?: number;
};

export class AIExecutionAnalyticsService {
  private static async getClient() {
    return await createAdminClient();
  }

  static async getSummary(
    wsId: string,
    startDate?: Date,
    endDate?: Date,
    options?: PricingOptions
  ): Promise<AIExecutionSummary | null> {
    const client = await AIExecutionAnalyticsService.getClient();

    if (!startDate || !endDate) {
      return null;
    }

    const params: Record<string, unknown> = {
      p_ws_id: wsId,
      p_start_date: startDate.toISOString(),
      p_end_date: endDate.toISOString(),
    };
    if (options?.pricing) params.p_pricing = options.pricing;
    if (options?.exchangeRate != null)
      params.p_exchange_rate = options.exchangeRate;

    const { data, error } = await client.rpc(
      'get_ai_execution_summary_v2',
      params as {
        p_ws_id: string;
        p_start_date?: string;
        p_end_date?: string;
        p_pricing?: AIPricing;
        p_exchange_rate?: number;
      }
    );

    if (error) {
      console.error('Error fetching AI execution summary:', error);
      return null;
    }

    return data?.[0] || null;
  }

  static async getDailyStats(
    wsId: string,
    startDate?: Date,
    endDate?: Date,
    options?: PricingOptions
  ): Promise<AIExecutionDailyStats[]> {
    const client = await AIExecutionAnalyticsService.getClient();

    if (!startDate || !endDate) {
      return [];
    }

    const params: Record<string, unknown> = {
      p_ws_id: wsId,
      p_start_date: startDate.toISOString(),
      p_end_date: endDate.toISOString(),
    };
    if (options?.pricing) params.p_pricing = options.pricing;

    const { data, error } = await client.rpc(
      'get_ai_execution_daily_stats_v2',
      params as {
        p_ws_id: string;
        p_start_date?: string;
        p_end_date?: string;
        p_pricing?: AIPricing;
      }
    );

    if (error) {
      console.error('Error fetching AI execution daily stats:', error);
      return [];
    }

    return data || [];
  }

  static async getModelStats(
    wsId: string,
    startDate?: Date,
    endDate?: Date,
    options?: PricingOptions
  ): Promise<AIExecutionModelStats[]> {
    const client = await AIExecutionAnalyticsService.getClient();

    if (!startDate || !endDate) {
      return [];
    }

    const params: Record<string, unknown> = {
      p_ws_id: wsId,
      p_start_date: startDate.toISOString(),
      p_end_date: endDate.toISOString(),
    };
    if (options?.pricing) params.p_pricing = options.pricing;

    const { data, error } = await client.rpc(
      'get_ai_execution_model_stats_v2',
      params as {
        p_ws_id: string;
        p_start_date?: string;
        p_end_date?: string;
        p_pricing?: AIPricing;
      }
    );

    if (error) {
      console.error('Error fetching AI execution model stats:', error);
      return [];
    }

    return data || [];
  }

  static async getMonthlyCost(
    wsId: string,
    year?: number,
    month?: number,
    options?: PricingOptions
  ): Promise<AIExecutionMonthlyCost | null> {
    const client = await AIExecutionAnalyticsService.getClient();

    const params: Record<string, unknown> = {
      p_ws_id: wsId,
      p_year: year || new Date().getFullYear(),
      p_month: month || new Date().getMonth() + 1,
    };
    if (options?.pricing) params.p_pricing = options.pricing;
    if (options?.exchangeRate != null)
      params.p_exchange_rate = options.exchangeRate;

    const { data, error } = await client.rpc(
      'get_ai_execution_monthly_cost_v2',
      params as {
        p_ws_id: string;
        p_year?: number;
        p_month?: number;
        p_pricing?: AIPricing;
        p_exchange_rate?: number;
      }
    );

    if (error) {
      console.error('Error fetching AI execution monthly cost:', error);
      return null;
    }

    return data?.[0] || null;
  }

  static async getCurrentMonthStats(wsId: string): Promise<{
    summary: AIExecutionSummary | null;
    dailyStats: AIExecutionDailyStats[];
    modelStats: AIExecutionModelStats[];
    monthlyCost: AIExecutionMonthlyCost | null;
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59
    );

    const [summary, dailyStats, modelStats, monthlyCost] = await Promise.all([
      AIExecutionAnalyticsService.getSummary(wsId, startOfMonth, endOfMonth),
      AIExecutionAnalyticsService.getDailyStats(wsId, startOfMonth, endOfMonth),
      AIExecutionAnalyticsService.getModelStats(wsId, startOfMonth, endOfMonth),
      AIExecutionAnalyticsService.getMonthlyCost(
        wsId,
        now.getFullYear(),
        now.getMonth() + 1
      ),
    ]);

    return {
      summary,
      dailyStats,
      modelStats,
      monthlyCost,
    };
  }

  static async getLast30DaysStats(wsId: string): Promise<{
    summary: AIExecutionSummary | null;
    dailyStats: AIExecutionDailyStats[];
    modelStats: AIExecutionModelStats[];
  }> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [summary, dailyStats, modelStats] = await Promise.all([
      AIExecutionAnalyticsService.getSummary(wsId, thirtyDaysAgo, now),
      AIExecutionAnalyticsService.getDailyStats(wsId, thirtyDaysAgo, now),
      AIExecutionAnalyticsService.getModelStats(wsId, thirtyDaysAgo, now),
    ]);

    return {
      summary,
      dailyStats,
      modelStats,
    };
  }

  static async getLast7DaysStats(wsId: string): Promise<{
    summary: AIExecutionSummary | null;
    dailyStats: AIExecutionDailyStats[];
    modelStats: AIExecutionModelStats[];
  }> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [summary, dailyStats, modelStats] = await Promise.all([
      AIExecutionAnalyticsService.getSummary(wsId, sevenDaysAgo, now),
      AIExecutionAnalyticsService.getDailyStats(wsId, sevenDaysAgo, now),
      AIExecutionAnalyticsService.getModelStats(wsId, sevenDaysAgo, now),
    ]);

    return {
      summary,
      dailyStats,
      modelStats,
    };
  }

  static async getAllTimeStats(wsId: string): Promise<{
    summary: AIExecutionSummary | null;
    dailyStats: AIExecutionDailyStats[];
    modelStats: AIExecutionModelStats[];
  }> {
    const client = await AIExecutionAnalyticsService.getClient();

    const [summary, dailyStats, modelStats] = await Promise.all([
      // Call v2 database functions directly with NULL dates for all-time data
      client
        .rpc('get_ai_execution_summary_v2', {
          p_ws_id: wsId,
          p_start_date: undefined,
          p_end_date: undefined,
        })
        .then(({ data, error }) => {
          if (error) {
            console.error('Error fetching AI execution summary:', error);
            return null;
          }
          return data?.[0] || null;
        }),
      client
        .rpc('get_ai_execution_daily_stats_v2', {
          p_ws_id: wsId,
          p_start_date: undefined,
          p_end_date: undefined,
        })
        .then(({ data, error }) => {
          if (error) {
            console.error('Error fetching AI execution daily stats:', error);
            return [];
          }
          return data || [];
        }),
      client
        .rpc('get_ai_execution_model_stats_v2', {
          p_ws_id: wsId,
          p_start_date: undefined,
          p_end_date: undefined,
        })
        .then(({ data, error }) => {
          if (error) {
            console.error('Error fetching AI execution model stats:', error);
            return [];
          }
          return data || [];
        }),
    ]);

    return {
      summary,
      dailyStats,
      modelStats,
    };
  }
}
