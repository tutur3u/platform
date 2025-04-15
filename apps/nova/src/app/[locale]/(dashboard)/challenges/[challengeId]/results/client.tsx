'use client';

import {
  NovaChallenge,
  NovaProblem,
  NovaSession,
  NovaSubmission,
} from '@tuturuuu/types/db';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { ArrowLeft, BookOpen, Clock } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { useRouter } from 'next/navigation';

type Results = {
  challenge: NovaChallenge;
  sessions: (NovaSession & {
    problems: (NovaProblem & {
      submissions: NovaSubmission[];
    })[];
  })[];
};

interface Props {
  data: Results;
}

export default function ResultClient({ data }: Props) {
  const router = useRouter();

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col">
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="mb-4 flex items-center md:mb-0">
            <Button
              onClick={() => router.push('/challenges')}
              variant="outline"
              size="icon"
              className="mr-4 h-10 w-10 rounded-full"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-3xl font-bold">{data.challenge.title}</h1>
          </div>
        </div>

        {data.sessions.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <Card className="max-w-md">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <BookOpen className="h-10 w-10" />
                </div>
                <CardTitle>No data available</CardTitle>
                <CardDescription>
                  We couldn't find any results for this challenge.
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex justify-center">
                <Button
                  onClick={() => router.push('/challenges')}
                  className="w-full"
                >
                  Back to Challenges
                </Button>
              </CardFooter>
            </Card>
          </div>
        ) : (
          data.sessions.map((session, sessionIndex) => {
            // Calculate total score, problems attempted, and total submissions
            const totalScore = session.problems.reduce((sum, problem) => {
              const bestScore =
                problem.submissions.length > 0
                  ? Math.max(...problem.submissions.map((s) => s.score || 0))
                  : 0;
              return sum + bestScore;
            }, 0);

            const problemsAttempted = session.problems.filter(
              (problem) => problem.submissions.length > 0
            ).length;

            const totalSubmissions = session.problems.reduce(
              (sum, problem) => sum + problem.submissions.length,
              0
            );

            return (
              <div key={sessionIndex} className="mb-8">
                <Card className="mb-4">
                  <CardHeader>
                    <CardTitle>Session {sessionIndex + 1}</CardTitle>
                    <CardDescription>
                      <p>
                        Started on{' '}
                        {new Date(session.created_at).toLocaleString()}
                      </p>
                      {session.end_time && (
                        <p>
                          Ended on {new Date(session.end_time).toLocaleString()}
                        </p>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="flex flex-col items-center rounded-lg border p-3">
                        <span className="text-sm text-muted-foreground">
                          Total Score
                        </span>
                        <span className="text-2xl font-bold">
                          {totalScore}/{session.problems.length * 10}
                        </span>
                      </div>
                      <div className="flex flex-col items-center rounded-lg border p-3">
                        <span className="text-sm text-muted-foreground">
                          Problems Attempted
                        </span>
                        <span className="text-2xl font-bold">
                          {problemsAttempted}/{session.problems.length}
                        </span>
                      </div>
                      <div className="flex flex-col items-center rounded-lg border p-3">
                        <span className="text-sm text-muted-foreground">
                          Total Submissions
                        </span>
                        <span className="text-2xl font-bold">
                          {totalSubmissions}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                  {session.problems.map((problem, problemIndex) => (
                    <Card key={problemIndex}>
                      <CardHeader>
                        <CardTitle className="flex justify-between">
                          <span>Problem {problemIndex + 1}</span>
                          {problem.submissions.length > 0 && (
                            <div
                              className={`inline-flex items-center justify-center rounded-full px-2 py-1 font-medium ${
                                (problem.submissions[0]?.score || 0) >= 8
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                  : (problem.submissions[0]?.score || 0) >= 5
                                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                              }`}
                            >
                              Best score:{' '}
                              {Math.max(
                                ...problem.submissions.map((s) => s.score || 0)
                              )}
                              /10
                            </div>
                          )}
                        </CardTitle>
                        <CardDescription>
                          {problem.submissions.length} submission
                          {problem.submissions.length !== 1 ? 's' : ''}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {problem.submissions.length > 0 ? (
                          <Accordion
                            type="single"
                            collapsible
                            className="w-full"
                          >
                            {problem.submissions
                              .sort((a, b) => (b.score || 0) - (a.score || 0))
                              .map((submission, subIndex) => (
                                <AccordionItem
                                  key={subIndex}
                                  value={`submission-${sessionIndex}-${problemIndex}-${subIndex}`}
                                >
                                  <AccordionTrigger className="rounded-lg px-4 hover:bg-muted/50">
                                    <div className="flex flex-1 justify-between">
                                      <div className="flex items-center">
                                        <span className="font-medium">
                                          Submission {subIndex + 1}
                                        </span>
                                        {subIndex === 0 && (
                                          <span className="ml-2 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
                                            Best
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center space-x-4">
                                        <div className="flex items-center">
                                          <Clock className="mr-1 h-4 w-4 text-muted-foreground" />
                                          <span className="text-sm text-muted-foreground">
                                            {new Date(
                                              submission.created_at
                                            ).toLocaleString()}
                                          </span>
                                        </div>
                                        <div
                                          className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 font-medium ${
                                            (submission.score || 0) >= 8
                                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                              : (submission.score || 0) >= 5
                                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                                          }`}
                                        >
                                          {`${submission.score || 0}/10`}
                                        </div>
                                      </div>
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent className="px-4">
                                    <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
                                      <div>
                                        <h4 className="mb-2 text-sm font-medium">
                                          Your Solution
                                        </h4>
                                        <div className="max-h-64 overflow-y-auto rounded-lg bg-muted p-3 whitespace-pre-wrap">
                                          {submission.prompt ||
                                            'No solution provided'}
                                        </div>
                                      </div>
                                      <div>
                                        <h4 className="mb-2 text-sm font-medium">
                                          Feedback
                                        </h4>
                                        <div className="max-h-64 overflow-y-auto rounded-lg bg-muted p-3 whitespace-pre-wrap">
                                          {submission.feedback ||
                                            'No feedback available'}
                                        </div>
                                      </div>
                                    </div>
                                  </AccordionContent>
                                </AccordionItem>
                              ))}
                          </Accordion>
                        ) : (
                          <div className="py-8 text-center text-muted-foreground">
                            <div className="mb-2">
                              No submissions for this problem
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {sessionIndex < data.sessions.length - 1 && (
                  <div className="col-span-full mt-8 w-full">
                    <Separator />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
