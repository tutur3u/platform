'use client';

import {
  NovaChallenge,
  NovaProblem,
  NovaSubmission,
  NovaSubmissionOutput,
} from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { ArrowLeft, Clipboard, ClipboardCheck } from '@tuturuuu/ui/icons';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface SubmissionDetails extends NovaSubmission {
  nova_problems: NovaProblem & {
    nova_challenges: NovaChallenge;
  };
  users: {
    display_name: string;
    avatar_url: string;
  };
  outputs?: NovaSubmissionOutput[];
}

export default function SubmissionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const submissionId = params.submissionId as string;

  const [submission, setSubmission] = useState<SubmissionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchSubmissionDetails();
  }, [submissionId]);

  async function fetchSubmissionDetails() {
    setLoading(true);
    try {
      // Fetch submission data
      const submissionRes = await fetch(
        `/api/v1/admin/submissions/${submissionId}`
      );

      if (!submissionRes.ok) {
        throw new Error('Failed to fetch submission details');
      }

      const submissionData = await submissionRes.json();

      // Fetch submission outputs if any
      const outputsRes = await fetch(
        `/api/v1/outputs?submissionId=${submissionId}`
      );
      if (outputsRes.ok) {
        const outputsData = await outputsRes.json();
        submissionData.outputs = outputsData;
      }

      setSubmission(submissionData);
    } catch (error) {
      console.error('Error fetching submission details:', error);
      setError('Failed to load submission details');
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getScoreColor(score: number) {
    if (score >= 8)
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    if (score >= 5)
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="mb-8 flex items-center">
          <Button
            onClick={() => router.push('/submissions')}
            variant="outline"
            className="mr-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Skeleton className="h-10 w-64" />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !submission) {
    return (
      <div className="container mx-auto py-8">
        <div className="mb-8 flex items-center">
          <Button
            onClick={() => router.push('/submissions')}
            variant="outline"
            className="mr-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error || 'Submission not found'}</p>
            <Button
              onClick={() => router.push('/submissions')}
              className="mt-4"
            >
              Return to Submissions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8 flex items-center">
        <Button
          onClick={() => router.push('/submissions')}
          variant="outline"
          className="mr-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-3xl font-bold">Submission #{submission.id}</h1>
        <Badge className={cn('ml-4 text-sm', getScoreColor(submission.score))}>
          Score: {submission.score}/10
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Submission Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Submission Details</CardTitle>
            <CardDescription>
              Submitted on {formatDate(submission.created_at)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6 space-y-4">
              <div>
                <h3 className="font-semibold text-muted-foreground">User</h3>
                <div className="mt-1 flex items-center gap-2">
                  {submission.users?.avatar_url ? (
                    <img
                      src={submission.users.avatar_url}
                      alt="User"
                      className="h-8 w-8 rounded-full"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                      {submission.users?.display_name?.charAt(0) || '?'}
                    </div>
                  )}
                  <span className="font-medium">
                    {submission.users?.display_name || 'Unknown User'}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-muted-foreground">
                  Challenge
                </h3>
                <p className="font-medium">
                  {submission.nova_problems?.nova_challenges?.title ||
                    'Unknown Challenge'}
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-muted-foreground">Problem</h3>
                <p className="font-medium">
                  {submission.nova_problems?.title || 'Unknown Problem'}
                </p>
              </div>
            </div>

            {submission.nova_problems?.nova_challenges?.id ? (
              <Button
                variant="outline"
                onClick={() => {
                  const challengeId =
                    submission.nova_problems?.nova_challenges?.id;
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

        {/* Prompt & Feedback Card */}
        <Card>
          <CardHeader>
            <CardTitle>Content</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="prompt">
              <TabsList className="w-full">
                <TabsTrigger value="prompt" className="flex-1">
                  Prompt
                </TabsTrigger>
                <TabsTrigger value="feedback" className="flex-1">
                  Feedback
                </TabsTrigger>
                {submission.outputs && submission.outputs.length > 0 && (
                  <TabsTrigger value="output" className="flex-1">
                    Output
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="prompt" className="mt-4">
                <div className="relative">
                  <pre className="max-h-[400px] overflow-auto rounded-md bg-muted/50 p-4 text-sm">
                    {submission.prompt}
                  </pre>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2"
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

              <TabsContent value="feedback" className="mt-4">
                <div className="max-h-[400px] overflow-auto rounded-md bg-muted/50 p-4 text-sm">
                  {submission.feedback || 'No feedback provided'}
                </div>
              </TabsContent>

              {submission.outputs && submission.outputs.length > 0 && (
                <TabsContent value="output" className="mt-4">
                  <div className="max-h-[400px] overflow-auto rounded-md bg-muted/50 p-4 text-sm">
                    {submission.outputs[0]?.output || 'No output available'}
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
