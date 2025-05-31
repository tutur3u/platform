'use client';

import { SubmissionCard } from '@/components/common/SubmissionCard';
import { NovaSubmissionData } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  RefreshCw,
  User,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

interface SubmissionClientProps {
  submission: NovaSubmissionData;
}

interface ReEvaluationProgress {
  step: string;
  progress: number;
  message: string;
  data?: any;
}

export default function SubmissionClient({
  submission,
}: SubmissionClientProps) {
  const router = useRouter();
  const [isReEvaluating, setIsReEvaluating] = useState(false);
  const [reEvaluationProgress, setReEvaluationProgress] =
    useState<ReEvaluationProgress | null>(null);

  // Helper function to determine score color
  const getScoreColor = (score: number | null) => {
    if (score === null) return 'bg-gray-200';
    if (score >= 8) return 'bg-emerald-500';
    if (score >= 5) return 'bg-amber-500';
    return 'bg-red-500';
  };

  // Helper function to determine badge variant
  const getBadgeVariant = (score: number | null) => {
    if (score === null) return 'outline';
    if (score >= 8) return 'success';
    if (score >= 5) return 'warning';
    return 'destructive';
  };

  // Helper function to format score
  const formatScore = (score: number | null) => {
    return score !== null ? `${score.toFixed(2)}/10` : 'Not scored';
  };

  // Calculate progress percentage for progress bars
  const getProgressPercentage = (score: number | null) => {
    return score !== null ? (score / 10) * 100 : 0;
  };

  const handleReEvaluate = async () => {
    if (isReEvaluating) return;

    try {
      setIsReEvaluating(true);
      setReEvaluationProgress({
        step: 'starting',
        progress: 0,
        message: 'Starting re-evaluation...',
      });

      const response = await fetch(
        `/api/v1/submissions/${submission.id}/re-evaluate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to start re-evaluation');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              setReEvaluationProgress(data);

              if (data.step === 'completed') {
                toast.success('Re-evaluation completed successfully!');
                // Refresh the page to show updated results
                setTimeout(() => {
                  router.refresh();
                }, 1000);
              } else if (data.step === 'error') {
                toast.error(`Re-evaluation failed: ${data.message}`);
              }
            } catch (error) {
              console.error('Error parsing SSE data:', error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error during re-evaluation:', error);
      toast.error('Failed to re-evaluate submission');
    } finally {
      setIsReEvaluating(false);
      setTimeout(() => {
        setReEvaluationProgress(null);
      }, 2000);
    }
  };

  return (
    <div className="container space-y-6 py-8">
      <div className="mb-6 flex items-center gap-4">
        <Button
          onClick={() => router.push('/submissions')}
          variant="outline"
          size="icon"
          className="rounded-full"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">Submission Details</h1>
          <p className="text-muted-foreground">ID: {submission.id}</p>
        </div>
        <div className="ml-auto">
          <Button
            onClick={handleReEvaluate}
            disabled={isReEvaluating}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isReEvaluating ? 'animate-spin' : ''}`}
            />
            {isReEvaluating ? 'Re-evaluating...' : 'Re-evaluate'}
          </Button>
        </div>
      </div>

      {/* Re-evaluation Progress */}
      {reEvaluationProgress && (
        <Card className="border border-dynamic-blue/20 bg-dynamic-blue/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-dynamic-blue">
              Re-evaluation Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-dynamic-blue">
                  {reEvaluationProgress.message}
                </span>
                <span className="text-dynamic-blue">
                  {Math.round(reEvaluationProgress.progress)}%
                </span>
              </div>
              <Progress value={reEvaluationProgress.progress} className="h-2" />
            </div>
            <p className="text-xs text-dynamic-blue">
              Current step: {reEvaluationProgress.step}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Submission Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 md:flex-row">
            <div className="w-full space-y-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">User</p>
                <div className="flex gap-2">
                  <User className="h-4 w-4 text-primary/70" />
                  <span className="font-medium">
                    {submission.user.display_name || 'Anonymous'}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Problem</p>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary/70" />
                  <Link
                    href={`/problems/${submission.problem.id}`}
                    className="font-medium hover:underline"
                  >
                    {submission.problem.title}
                  </Link>
                </div>
              </div>

              {submission.created_at && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Submitted</p>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary/70" />
                    <span className="font-medium">
                      {new Date(submission.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="w-full">
              {/* Total Score - Highlighted */}
              <div className="mb-8 flex flex-col items-center justify-center">
                <p className="mb-2 text-sm font-medium text-muted-foreground">
                  Total Score
                </p>
                <div className="relative flex h-32 w-32 items-center justify-center rounded-full border-8 border-muted">
                  <div
                    className={`absolute inset-0 rounded-full ${getScoreColor(submission.total_score)}`}
                    style={{
                      clipPath: `circle(${getProgressPercentage(submission.total_score)}% at center)`,
                    }}
                  />
                  <span className="relative z-10 text-4xl font-bold">
                    {submission.total_score !== null
                      ? submission.total_score.toFixed(1)
                      : '-'}
                  </span>
                </div>
              </div>

              {/* Test Case and Criteria Scores */}
              <div className="space-y-4">
                <div className="space-y-3 rounded-lg bg-muted/50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Test Case Score</p>
                    <Badge
                      variant={getBadgeVariant(submission.test_case_score)}
                      className="px-2 py-1"
                    >
                      {formatScore(submission.test_case_score)}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg bg-muted/50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Criteria Score</p>
                    <Badge
                      variant={getBadgeVariant(submission.criteria_score)}
                      className="px-2 py-1"
                    >
                      {formatScore(submission.criteria_score)}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <SubmissionCard
          submission={submission}
          isCurrent={false}
          onRequestFetch={() => {}} // Already have full data
          isLoading={false}
        />
      </div>
    </div>
  );
}
