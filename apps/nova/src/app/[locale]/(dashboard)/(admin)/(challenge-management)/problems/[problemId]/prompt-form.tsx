'use client';

import { ExtendedNovaSubmission, fetchSubmissions } from './actions';
import { SubmissionCard } from './submission-card';
import { NovaProblem, NovaProblemTestCase } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Clock, PlayCircle } from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import React, { useCallback, useEffect, useState } from 'react';

interface Props {
  problem: NovaProblem & {
    test_cases: NovaProblemTestCase[];
  };
}

export default function PromptForm({ problem }: Props) {
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissions, setSubmissions] = useState<ExtendedNovaSubmission[]>([]);
  const [activeTab, setActiveTab] = useState('prompt');

  const getSubmissions = useCallback(async () => {
    const submissions = await fetchSubmissions(problem.id);
    setSubmissions(submissions);
  }, [problem.id]);

  useEffect(() => {
    getSubmissions();
  }, [getSubmissions]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    if (!prompt.trim() || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Call the API endpoint which now handles evaluation, submission creation, and saving results
      const promptResponse = await fetch(
        `/api/v1/problems/${problem.id}/prompt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            sessionId: null,
          }),
        }
      );

      if (!promptResponse.ok) {
        throw new Error('Failed to process prompt');
      }

      // Reset prompt and show success message
      setPrompt('');
      setActiveTab('submissions');

      toast({
        title: 'Prompt submitted successfully',
        description: 'Your prompt has been evaluated.',
      });
    } catch (error) {
      console.error('Error submitting prompt:', error);
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to submit prompt. Please try again.',
        variant: 'destructive',
      });
    } finally {
      getSubmissions();
      setIsSubmitting(false);
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="mb-4 grid w-full grid-cols-2">
        <TabsTrigger value="prompt">Prompt</TabsTrigger>
        <TabsTrigger value="submissions">
          Submissions
          {submissions.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {submissions.length}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="prompt" className="space-y-4">
        <div className="flex h-full flex-col">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-muted-foreground text-sm">
              Characters: {prompt.length} / {problem.max_prompt_length}
            </div>
            <Progress
              value={(prompt.length / problem.max_prompt_length) * 100}
              className="h-1 w-24"
            />
          </div>

          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write your prompt here..."
            className="flex-1 resize-none"
            maxLength={problem.max_prompt_length}
          />

          <div className="mt-4 flex justify-end">
            <Button
              onClick={handleSend}
              disabled={!prompt.trim() || isSubmitting}
              className="gap-2"
            >
              {isSubmitting ? (
                <LoadingIndicator className="h-4 w-4" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              Submit
            </Button>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="submissions" className="space-y-4">
        {submissions.length == 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
            <Clock className="text-muted-foreground mb-2 h-10 w-10" />
            <h3 className="text-lg font-medium">No submissions yet</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Your submission history will appear here after you submit your
              first prompt.
            </p>
          </div>
        ) : (
          <>
            {/* Group by session_id or show independently */}
            {(() => {
              // Group submissions by session_id (null ones are grouped separately)
              const groupedBySession = submissions.reduce(
                (acc, submission) => {
                  const key = submission.session_id || 'standalone';
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(submission);
                  return acc;
                },
                {} as Record<string, ExtendedNovaSubmission[]>
              );

              return Object.entries(groupedBySession).map(
                ([sessionKey, groupedSubmissions]) => (
                  <div key={sessionKey} className="mb-6">
                    {sessionKey !== 'standalone' && (
                      <div className="mb-2 flex items-center">
                        <Badge variant="outline" className="mb-2">
                          Session ID: {sessionKey}
                        </Badge>
                      </div>
                    )}

                    <div className="space-y-4">
                      {groupedSubmissions.map((submission) => (
                        <SubmissionCard
                          key={submission.id}
                          submission={submission}
                        />
                      ))}
                    </div>
                  </div>
                )
              );
            })()}
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}
