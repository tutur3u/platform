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
  Clock,
  FileCode,
  User,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import Link from 'next/link';

interface SubmissionClientProps {
  submission: NovaSubmissionData;
}

export default function SubmissionClient({
  submission,
}: SubmissionClientProps) {
  return (
    <div className="container space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/submissions"
            className="text-muted-foreground mb-2 flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back to submissions
          </Link>
          <h1 className="text-3xl font-bold">Submission Details</h1>
          <p className="text-muted-foreground">
            Detailed view of submission {submission.id}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={`/challenges/${submission.challenge.id}`}>
            <Button variant="outline" className="gap-1">
              <BookOpen className="h-4 w-4" />
              <span>View Challenge</span>
            </Button>
          </Link>

          <Link href={`/admin/challenges/${submission.challenge.id}`}>
            <Button variant="default" className="gap-1">
              <FileCode className="h-4 w-4" />
              <span>Edit Challenge</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Submission Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
              <div className="space-y-1">
                <p className="text-muted-foreground text-sm">User</p>
                <div className="flex items-center gap-2">
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
                  <span className="font-medium">
                    {submission.problem.title || 'Unknown Problem'}
                  </span>
                </div>
              </div>

              {submission.created_at && (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Submitted</p>
                  <div className="flex items-center gap-2">
                    <Calendar className="text-primary/70 h-4 w-4" />
                    <span className="font-medium">
                      {new Date(submission.created_at!).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              )}

              {submission.created_at && (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Time</p>
                  <div className="flex items-center gap-2">
                    <Clock className="text-primary/70 h-4 w-4" />
                    <span className="font-medium">
                      {new Date(submission.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <Separator className="my-4" />

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <p className="text-muted-foreground text-sm">Total Score</p>
                <div>
                  <Badge
                    variant={
                      submission.total_score && submission.total_score >= 8
                        ? 'success'
                        : submission.total_score && submission.total_score >= 5
                          ? 'warning'
                          : 'destructive'
                    }
                    className="px-2 py-1 text-sm"
                  >
                    {submission.total_score !== null
                      ? `${submission.total_score.toFixed(2)}/10`
                      : 'Not scored'}
                  </Badge>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-muted-foreground text-sm">Test Case Score</p>
                <div>
                  <Badge
                    variant={
                      submission.test_case_score &&
                      submission.test_case_score >= 8
                        ? 'success'
                        : submission.test_case_score &&
                            submission.test_case_score >= 5
                          ? 'warning'
                          : 'destructive'
                    }
                    className="px-2 py-1 text-sm"
                  >
                    {submission.test_case_score !== null
                      ? `${submission.test_case_score.toFixed(2)}/10`
                      : 'Not scored'}
                  </Badge>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-muted-foreground text-sm">Criteria Score</p>
                <div>
                  <Badge
                    variant={
                      submission.criteria_score &&
                      submission.criteria_score >= 8
                        ? 'success'
                        : submission.criteria_score &&
                            submission.criteria_score >= 5
                          ? 'warning'
                          : 'destructive'
                    }
                    className="px-2 py-1 text-sm"
                  >
                    {submission.criteria_score !== null
                      ? `${submission.criteria_score.toFixed(2)}/10`
                      : 'Not scored'}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardContent className="pt-6">
            <SubmissionCard
              submission={submission}
              isCurrent={false}
              onRequestFetch={() => {}} // Already have full data
              isLoading={false}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
