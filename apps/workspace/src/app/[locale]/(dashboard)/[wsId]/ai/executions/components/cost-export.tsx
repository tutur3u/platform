'use client';

import { Download, FileText, Table } from '@tuturuuu/icons';
import type { WorkspaceAIExecution } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';
import { calculateCost } from '../utils/cost-calculator';

interface CostExportProps {
  executions: WorkspaceAIExecution[];
}

export function CostExport({ executions }: CostExportProps) {
  const t = useTranslations('ai-execution-charts');

  const exportToCSV = () => {
    const headers = [
      'ID',
      'Model',
      'Input Tokens',
      'Output Tokens',
      'Reasoning Tokens',
      'Total Tokens',
      'Cost (USD)',
      'Cost (VND)',
      'Created At',
    ];

    const csvData = executions.map((execution) => {
      const cost = calculateCost(execution.model_id, {
        inputTokens: execution.input_tokens,
        outputTokens: execution.output_tokens,
        reasoningTokens: execution.reasoning_tokens,
        totalTokens: execution.total_tokens,
      });

      return [
        execution.id,
        execution.model_id,
        execution.input_tokens,
        execution.output_tokens,
        execution.reasoning_tokens,
        execution.total_tokens,
        cost.totalCostUSD.toFixed(8),
        cost.totalCostVND.toFixed(2),
        new Date(execution.created_at).toISOString(),
      ];
    });

    const csvContent = [headers, ...csvData]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `ai-executions-cost-${new Date().toISOString().split('T')[0]}.csv`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToJSON = () => {
    const jsonData = executions.map((execution) => {
      const cost = calculateCost(execution.model_id, {
        inputTokens: execution.input_tokens,
        outputTokens: execution.output_tokens,
        reasoningTokens: execution.reasoning_tokens,
        totalTokens: execution.total_tokens,
      });

      return {
        id: execution.id,
        model: execution.model_id,
        tokens: {
          input: execution.input_tokens,
          output: execution.output_tokens,
          reasoningText: execution.reasoning_tokens,
          total: execution.total_tokens,
        },
        cost: {
          usd: cost.totalCostUSD,
          vnd: cost.totalCostVND,
          breakdown: {
            input: cost.inputCost,
            output: cost.outputCost,
            reasoningText: cost.reasoningCost,
          },
        },
        created_at: execution.created_at,
      };
    });

    const blob = new Blob([JSON.stringify(jsonData, null, 2)], {
      type: 'application/json',
    });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `ai-executions-cost-${new Date().toISOString().split('T')[0]}.json`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generateSummary = () => {
    const totalCost = executions.reduce((sum, execution) => {
      const cost = calculateCost(execution.model_id, {
        inputTokens: execution.input_tokens,
        outputTokens: execution.output_tokens,
        reasoningTokens: execution.reasoning_tokens,
        totalTokens: execution.total_tokens,
      });
      return sum + cost.totalCostUSD;
    }, 0);

    const totalTokens = executions.reduce(
      (sum, execution) => sum + execution.total_tokens,
      0
    );
    const avgCostPerExecution = totalCost / executions.length;

    const modelBreakdown = new Map<
      string,
      { cost: number; executions: number }
    >();
    executions.forEach((execution) => {
      const cost = calculateCost(execution.model_id, {
        inputTokens: execution.input_tokens,
        outputTokens: execution.output_tokens,
        reasoningTokens: execution.reasoning_tokens,
        totalTokens: execution.total_tokens,
      });

      const existing = modelBreakdown.get(execution.model_id) || {
        cost: 0,
        executions: 0,
      };
      modelBreakdown.set(execution.model_id, {
        cost: existing.cost + cost.totalCostUSD,
        executions: existing.executions + 1,
      });
    });

    const summary = {
      summary: {
        total_executions: executions.length,
        total_cost_usd: totalCost,
        total_cost_vnd: totalCost * 26000,
        total_tokens: totalTokens,
        average_cost_per_execution: avgCostPerExecution,
        export_date: new Date().toISOString(),
      },
      model_breakdown: Array.from(modelBreakdown.entries()).map(
        ([model, data]) => ({
          model,
          cost: data.cost,
          executions: data.executions,
          percentage: (data.cost / totalCost) * 100,
        })
      ),
    };

    const blob = new Blob([JSON.stringify(summary, null, 2)], {
      type: 'application/json',
    });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `ai-executions-summary-${new Date().toISOString().split('T')[0]}.json`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          {t('export_cost_data')}
        </CardTitle>
        <CardDescription>{t('export_cost_data_description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Button
            onClick={exportToCSV}
            variant="outline"
            className="h-auto flex-col gap-2 p-4"
          >
            <Table className="h-5 w-5" />
            <div className="text-center">
              <div className="font-medium">{t('export_csv')}</div>
              <div className="text-muted-foreground text-xs">
                {t('export_csv_description')}
              </div>
            </div>
          </Button>

          <Button
            onClick={exportToJSON}
            variant="outline"
            className="h-auto flex-col gap-2 p-4"
          >
            <FileText className="h-5 w-5" />
            <div className="text-center">
              <div className="font-medium">{t('export_json')}</div>
              <div className="text-muted-foreground text-xs">
                {t('export_json_description')}
              </div>
            </div>
          </Button>

          <Button
            onClick={generateSummary}
            variant="outline"
            className="h-auto flex-col gap-2 p-4"
          >
            <FileText className="h-5 w-5" />
            <div className="text-center">
              <div className="font-medium">{t('export_summary')}</div>
              <div className="text-muted-foreground text-xs">
                {t('export_summary_description')}
              </div>
            </div>
          </Button>
        </div>

        <div className="text-muted-foreground text-sm">
          {t('export_note', { count: executions.length })}
        </div>
      </CardContent>
    </Card>
  );
}
