'use client';

import CriteriaEvaluation from './components/CriteriaEvaluation';
import TestCaseEvaluation from './components/TestCaseEvaluation';
import { SubmissionData } from './types';
import ScoreBadge from '@/components/common/ScoreBadge';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  ArrowLeft,
  Calendar,
  CheckSquare,
  Clipboard,
  ClipboardCheck,
  FileCode,
  Mail,
  PencilRuler,
  Timer,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
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

  // Safe date calculation for session duration
  function getSessionDuration(): string {
    if (!submission.session?.start_time || !submission.session?.end_time) {
      return 'N/A';
    }

    const startTime = new Date(submission.session.start_time).getTime();
    const endTime = new Date(submission.session.end_time).getTime();

    if (isNaN(startTime) || isNaN(endTime) || endTime <= startTime) {
      return 'N/A';
    }

    const durationMinutes = Math.floor((endTime - startTime) / 60000);
    return `${durationMinutes} min`;
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6 flex items-center gap-4">
        <Button
          onClick={() => router.push('/submissions')}
          variant="outline"
          size="icon"
          className="rounded-full"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Submission Details</h1>
          <p className="text-muted-foreground">ID: {submission.id}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column - User & Challenge Info */}
        <div className="space-y-6 md:col-span-1">
          {/* User Card */}
          <Card>
            <CardHeader>
              <CardTitle>User</CardTitle>
              <CardDescription>Submission author</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                {submission.user?.avatar_url ? (
                  <img
                    src={submission.user.avatar_url}
                    alt={submission.user.display_name || 'User'}
                    className="h-12 w-12 rounded-full"
                  />
                ) : (
                  <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold">
                    {submission.user?.display_name?.charAt(0) || '?'}
                  </div>
                )}
                <div>
                  <h3 className="font-medium">
                    {submission.user?.display_name || 'Unknown User'}
                  </h3>
                  {submission.user?.email && (
                    <div className="text-muted-foreground flex items-center text-sm">
                      <Mail className="mr-1 h-3.5 w-3.5" />
                      <span>{submission.user.email}</span>
                    </div>
                  )}
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (submission.user?.id) {
                    router.push(`/profile/${submission.user.id}`);
                  }
                }}
                className="w-full"
                disabled={!submission.user?.id}
              >
                View User Profile
              </Button>
            </CardContent>
          </Card>

          {/* Challenge & Problem Card */}
          <Card>
            <CardHeader>
              <CardTitle>Challenge & Problem</CardTitle>
              <CardDescription>Submission details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-muted-foreground mb-1 text-sm font-medium">
                  Challenge
                </h3>
                <p className="font-medium">
                  {submission.problem.challenge.title}
                </p>
                {submission.problem.challenge.id && (
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-1 h-auto px-0"
                    onClick={() =>
                      router.push(
                        `/challenges/${submission.problem.challenge.id}`
                      )
                    }
                  >
                    View Challenge
                  </Button>
                )}
              </div>

              <div>
                <h3 className="text-muted-foreground mb-1 text-sm font-medium">
                  Problem
                </h3>
                <p className="font-medium">{submission.problem.title}</p>
                {submission.problem.id && (
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-1 h-auto px-0"
                    onClick={() =>
                      router.push(`/problems/${submission.problem.id}`)
                    }
                  >
                    View Problem
                  </Button>
                )}
              </div>

              <div>
                <h3 className="text-muted-foreground mb-1 text-sm font-medium">
                  Submitted
                </h3>
                <p className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>{formatDate(submission.created_at)}</span>
                </p>
              </div>

              {submission.session && (
                <div>
                  <h3 className="text-muted-foreground mb-1 text-sm font-medium">
                    Session
                  </h3>
                  <p>
                    <Badge variant="outline" className="font-mono text-xs">
                      {submission.session.id.substring(0, 8)}...
                    </Badge>
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <Timer className="text-muted-foreground h-4 w-4" />
                    <span>{getSessionDuration()}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Score Summary Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Score Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <ScoreBadge
                  score={submission.total_score}
                  maxScore={10}
                  className="flex h-32 w-32 flex-col justify-center text-center text-2xl"
                >
                  <div className="font-bold">
                    {submission.total_score.toFixed(1)}
                  </div>
                  <div className="text-xs opacity-80">/10</div>
                </ScoreBadge>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center text-xs">
                    <CheckSquare className="mr-1 h-3.5 w-3.5" />
                    Test Cases
                  </p>
                  <p className="text-sm font-semibold">
                    {submission.test_case_score.toFixed(1)}/10
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {submission.passed_tests}/{submission.total_tests} passed
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center text-xs">
                    <PencilRuler className="mr-1 h-3.5 w-3.5" />
                    Criteria
                  </p>
                  <p className="text-sm font-semibold">
                    {submission.criteria_score.toFixed(1)}/10
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {submission.sum_criterion_score.toFixed(1)}/
                    {submission.total_criteria * 10} points
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (submission.problem.challenge.id) {
                    router.push(
                      `/challenges/${submission.problem.challenge.id}/results`
                    );
                  }
                }}
                className="w-full"
                disabled={!submission.problem.challenge.id}
              >
                View Challenge Results
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Right Column - Content and Evaluation */}
        <div className="space-y-6 md:col-span-2">
          {/* Prompt & Output */}
          <Card>
            <CardHeader>
              <CardTitle>Submission Content</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="prompt" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger
                    value="prompt"
                    className="flex items-center gap-1"
                  >
                    <FileCode className="h-4 w-4" />
                    Prompt
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="prompt" className="mt-0">
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
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Evaluation Tabs */}
          <Card>
            <CardHeader>
              <CardTitle>Evaluation Results</CardTitle>
              <CardDescription>
                Test cases and criteria assessment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="tests" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger
                    value="tests"
                    className="flex items-center gap-1"
                  >
                    <CheckSquare className="h-4 w-4" />
                    Test Cases
                    <Badge variant="secondary" className="ml-2">
                      {submission.passed_tests}/{submission.total_tests}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger
                    value="criteria"
                    className="flex items-center gap-1"
                  >
                    <PencilRuler className="h-4 w-4" />
                    Criteria
                    <Badge variant="secondary" className="ml-2">
                      {submission.criteria.length}
                    </Badge>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="tests" className="mt-0">
                  <TestCaseEvaluation submission={submission} />
                </TabsContent>

                <TabsContent value="criteria" className="mt-0">
                  <CriteriaEvaluation submission={submission} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
