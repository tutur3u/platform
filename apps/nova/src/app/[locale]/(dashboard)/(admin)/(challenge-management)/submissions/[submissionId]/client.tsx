'use client';

import { SubmissionCard } from '@/components/common/SubmissionCard';
import { NovaSubmissionData } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { ArrowLeft, BookOpen, Calendar, User } from '@tuturuuu/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface SubmissionClientProps {
  submission: NovaSubmissionData;
}

export default function SubmissionClient({
  submission,
}: SubmissionClientProps) {
  const router = useRouter();

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
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Submission Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 md:flex-row">
            <div className="w-full space-y-4">
              <div className="space-y-1">
                <p className="text-muted-foreground text-sm">User</p>
                <div className="flex gap-2">
                  <User className="text-primary/70 h-4 w-4" />
                  <span className="font-medium">
                    {submission.user.display_name || 'Anonymous'}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-muted-foreground text-sm">Problem</p>
                <div className="flex items-center gap-2">
                  <BookOpen className="text-primary/70 h-4 w-4" />
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
                  <p className="text-muted-foreground text-sm">Submitted</p>
                  <div className="flex items-center gap-2">
                    <Calendar className="text-primary/70 h-4 w-4" />
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
                <p className="text-muted-foreground mb-2 text-sm font-medium">
                  Total Score
                </p>
                <div className="border-muted relative flex h-32 w-32 items-center justify-center rounded-full border-8">
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
                <div className="bg-muted/50 space-y-3 rounded-lg p-4">
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

                <div className="bg-muted/50 space-y-3 rounded-lg p-4">
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
