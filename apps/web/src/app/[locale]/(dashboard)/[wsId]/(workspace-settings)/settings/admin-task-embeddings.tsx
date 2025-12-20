'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, AlertCircle, CheckCircle2, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';

interface EmbeddingStats {
  total: number;
  withEmbeddings: number;
  withoutEmbeddings: number;
  percentageComplete: number;
}

interface ProgressData {
  current: number;
  total: number;
  success: number;
  failed: number;
}

export default function AdminTaskEmbeddings() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [batchSize, setBatchSize] = useState(50);

  const {
    data: stats,
    isLoading,
    isError,
    error: fetchError,
    refetch: fetchStats,
  } = useQuery<EmbeddingStats>({
    queryKey: ['admin', 'task-embeddings', 'stats'],
    queryFn: async () => {
      const response = await fetch('/api/admin/tasks/embeddings/stats');
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch statistics');
      }
      return response.json();
    },
  });

  const handleGenerate = async () => {
    if (!stats || stats.withoutEmbeddings === 0) {
      toast.info('No tasks need embeddings');
      return;
    }

    setIsGenerating(true);
    setProgress(null);

    try {
      const response = await fetch('/api/admin/tasks/embeddings/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchSize }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate embeddings');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      // Process SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'start') {
                setProgress({
                  current: 0,
                  total: data.total,
                  success: 0,
                  failed: 0,
                });
              } else if (data.type === 'progress') {
                setProgress({
                  current: data.current,
                  total: data.total,
                  success: data.success,
                  failed: data.failed,
                });
              } else if (data.type === 'complete') {
                toast.success('Embedding generation completed', {
                  description: `Processed ${data.processed} tasks: ${data.success} succeeded, ${data.failed} failed.`,
                });
                // Refresh stats
                await fetchStats();
              } else if (data.type === 'error') {
                throw new Error(data.message || 'Unknown error');
              }
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error generating embeddings:', error);
      toast.error('Failed to generate embeddings', {
        description:
          error instanceof Error ? error.message : 'An unknown error occurred',
      });
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  };

  const progressPercentage = progress
    ? (progress.current / progress.total) * 100
    : 0;

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-dynamic-purple" />
          System-Wide Task Embeddings
          <span className="ml-auto rounded-full bg-dynamic-red/10 px-2 py-1 font-medium text-dynamic-red text-xs">
            Admin Only
          </span>
        </CardTitle>
        <CardDescription>
          Generate AI embeddings for all tasks across the platform to enable
          semantic search. This tool is only accessible to Tuturuuu admins.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Statistics Section */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Activity className="h-8 w-8 animate-spin text-dynamic-purple/50" />
          </div>
        ) : isError ? (
          <div className="text-center">
            <div className="mb-2 text-destructive">
              {fetchError?.message || 'Failed to load statistics'}
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchStats()}>
              Retry
            </Button>
          </div>
        ) : stats ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="font-medium text-muted-foreground text-sm">
                  Total Tasks
                </div>
                <div className="mt-2 font-bold text-2xl">
                  {stats.total.toLocaleString()}
                </div>
              </div>

              <div className="rounded-lg border bg-dynamic-green/10 p-4">
                <div className="flex items-center gap-2 font-medium text-dynamic-green text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  With Embeddings
                </div>
                <div className="mt-2 font-bold text-2xl text-dynamic-green">
                  {stats.withEmbeddings.toLocaleString()}
                </div>
              </div>

              <div className="rounded-lg border bg-dynamic-orange/10 p-4">
                <div className="flex items-center gap-2 font-medium text-dynamic-orange text-sm">
                  <AlertCircle className="h-4 w-4" />
                  Missing Embeddings
                </div>
                <div className="mt-2 font-bold text-2xl text-dynamic-orange">
                  {stats.withoutEmbeddings.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Overall Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Overall Coverage</span>
                <span className="text-muted-foreground">
                  {stats.percentageComplete.toFixed(1)}%
                </span>
              </div>
              <Progress value={stats.percentageComplete} className="h-2" />
            </div>
          </div>
        ) : (
          <div className="text-center text-muted-foreground text-sm">
            No statistics available
          </div>
        )}

        <Separator />

        {/* Generation Section */}
        <div className="space-y-4">
          <div>
            <label className="font-medium text-sm">Batch Size</label>
            <p className="mb-2 text-muted-foreground text-xs">
              Number of tasks to process per batch (max 100)
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="100"
                value={batchSize}
                onChange={(e) =>
                  setBatchSize(
                    Math.min(
                      100,
                      Math.max(1, Number.parseInt(e.target.value, 10) || 50)
                    )
                  )
                }
                disabled={isGenerating}
                className="w-24 rounded-md border px-3 py-2 text-sm disabled:opacity-50"
              />
              <span className="text-muted-foreground text-sm">tasks</span>
            </div>
          </div>

          {/* Progress Indicator */}
          {isGenerating && progress && (
            <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Processing Tasks</span>
                <span className="text-muted-foreground">
                  {progress.current} / {progress.total}
                </span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-dynamic-green" />
                  {progress.success} succeeded
                </span>
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 text-dynamic-red" />
                  {progress.failed} failed
                </span>
              </div>
            </div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={
              isGenerating ||
              isLoading ||
              !stats ||
              stats.withoutEmbeddings === 0
            }
            className="w-full sm:w-auto"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Activity className="mr-2 h-4 w-4 animate-spin" />
                Generating... ({progress?.current || 0}/{progress?.total || 0})
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Embeddings
              </>
            )}
          </Button>

          {stats && stats.withoutEmbeddings > batchSize && (
            <p className="text-muted-foreground text-xs">
              ⚠️ You have {stats.withoutEmbeddings.toLocaleString()} tasks
              without embeddings. Run this tool multiple times to process all
              tasks.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}