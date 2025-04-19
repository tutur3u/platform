'use client';

import CriteriaEvaluation from './components/CriteriaEvaluation';
import TestCaseEvaluation from './components/TestCaseEvaluation';
import { SubmissionData } from './types';
import ScoreBadge from '@/components/common/ScoreBadge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { ArrowLeft, Clipboard, ClipboardCheck } from '@tuturuuu/ui/icons';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  submission: SubmissionData;
}

export default function SubmissionClient({ submission }: Props) {
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8 flex gap-4">
        <Button
          onClick={() => router.push('/submissions')}
          variant="outline"
          className="rounded-full"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold">Submission #{submission.id}</h1>
      </div>

      {/* Submission Info Card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div className="flex flex-col gap-2">
            <CardTitle>Submission Details</CardTitle>
            <CardDescription>
              Submitted on {formatDate(submission.created_at)}
            </CardDescription>
          </div>
          <ScoreBadge
            score={submission.total_score}
            maxScore={10}
            className="text-sm"
          >
            Score: {submission.total_score.toFixed(2)}/10
          </ScoreBadge>
        </CardHeader>
        <CardContent>
          <div className="mb-6 space-y-4">
            <div>
              <h3 className="text-muted-foreground font-semibold">User</h3>
              <div className="mt-1 flex items-center gap-2">
                {submission.user?.avatar_url ? (
                  <img
                    src={submission.user.avatar_url}
                    alt="User"
                    className="h-8 w-8 rounded-full"
                  />
                ) : (
                  <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full">
                    {submission.user?.display_name?.charAt(0) || '?'}
                  </div>
                )}
                <span className="font-medium">
                  {submission.user?.display_name || 'Unknown User'}
                </span>
              </div>
            </div>

            <div>
              <h3 className="text-muted-foreground font-semibold">Challenge</h3>
              <p className="font-medium">
                {submission.problem.challenge.title || 'Unknown Challenge'}
              </p>
            </div>

            <div>
              <h3 className="text-muted-foreground font-semibold">Problem</h3>
              <p className="font-medium">
                {submission.problem.title || 'Unknown Problem'}
              </p>
            </div>

            <div>
              <h3 className="text-foreground font-bold">Prompt</h3>
              <div className="relative">
                <pre className="bg-muted/50 max-h-[400px] overflow-auto rounded-md p-4 text-sm">
                  {submission.prompt}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2"
                  onClick={() => copyToClipboard(submission.prompt)}
                >
                  {copied ? (
                    <ClipboardCheck className="h-4 w-4" />
                  ) : (
                    <Clipboard className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {submission.problem.challenge.id ? (
            <Button
              variant="outline"
              onClick={() => {
                const challengeId = submission.problem.challenge.id;
                if (challengeId) {
                  router.push(`/challenges/${challengeId}/results`);
                }
              }}
              className="w-full"
            >
              View Challenge Results
            </Button>
          ) : (
            <Button variant="outline" className="w-full" disabled>
              Challenge Results Not Available
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Evaluation Section */}
      <div className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">Evaluation</h2>

        <div className="space-y-6">
          {/* Test Cases */}
          {(submission.total_tests > 0 || submission.test_case_score > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Test Cases</CardTitle>
                <CardDescription>
                  {submission.passed_tests} of {submission.total_tests} tests
                  passed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TestCaseEvaluation submission={submission} />
              </CardContent>
            </Card>
          )}

          {/* Criteria */}
          {submission.criteria && submission.criteria.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Evaluation Criteria</CardTitle>
                <CardDescription>
                  Criteria score: {submission.criteria_score.toFixed(1)}/10
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CriteriaEvaluation submission={submission} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
