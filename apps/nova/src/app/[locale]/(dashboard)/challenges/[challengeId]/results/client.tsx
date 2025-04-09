'use client';

import {
  NovaChallenge,
  NovaChallengeCriteria,
  NovaProblem,
  NovaProblemCriteriaScore,
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
import {
  ArrowLeft,
  BookOpen,
  Clock,
  FileText,
  Medal,
  TrendingUp,
} from '@tuturuuu/ui/icons';
import { useRouter } from 'next/navigation';

type ReportData = NovaSession & {
  challenge: NovaChallenge & {
    criteria: NovaChallengeCriteria[];
    problems: (NovaProblem & {
      criteria_scores: NovaProblemCriteriaScore[];
      submissions: NovaSubmission[];
    })[];
  };
};

interface Props {
  data?: ReportData;
}

export default function ResultClient({ data }: Props) {
  const router = useRouter();

  if (!data) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <Card className="mx-auto max-w-md">
          <CardHeader className="text-center">
            <div className="bg-muted text-muted-foreground mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
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
    );
  }

  return (
    <div className="bg-background min-h-screen px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
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

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                Total Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <Medal className="mr-2 h-5 w-5 text-yellow-500" />
                <div className="text-2xl font-bold">{data.total_score}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                Problems Attempted
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <FileText className="mr-2 h-5 w-5 text-blue-500" />
                <div className="text-2xl font-bold">
                  {
                    data.challenge.problems.filter(
                      (p) => p.submissions.length > 0
                    ).length
                  }
                  /{data.challenge.problems.length}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                Submissions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <TrendingUp className="mr-2 h-5 w-5 text-green-500" />
                <div className="text-2xl font-bold">
                  {data.challenge.problems.reduce(
                    (acc, p) => acc + p.submissions.length,
                    0
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {data.challenge.problems.map((problem, problemIndex) => (
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
                  <Accordion type="single" collapsible className="w-full">
                    {problem.submissions
                      .sort((a, b) => (b.score || 0) - (a.score || 0))
                      .map((submission, subIndex) => (
                        <AccordionItem
                          key={subIndex}
                          value={`submission-${problemIndex}-${subIndex}`}
                        >
                          <AccordionTrigger className="hover:bg-muted/50 rounded-lg px-4">
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
                                  <Clock className="text-muted-foreground mr-1 h-4 w-4" />
                                  <span className="text-muted-foreground text-sm">
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
                                <div className="bg-muted max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg p-3">
                                  {submission.prompt || 'No solution provided'}
                                </div>
                              </div>
                              <div>
                                <h4 className="mb-2 text-sm font-medium">
                                  Feedback
                                </h4>
                                <div className="bg-muted max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg p-3">
                                  {submission.feedback ||
                                    'No feedback available'}
                                </div>
                              </div>
                            </div>

                            {data.challenge.criteria.length > 0 && (
                              <div className="mt-4">
                                <h4 className="mb-2 text-sm font-medium">
                                  Criteria Breakdown
                                </h4>
                                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                  {data.challenge.criteria.map((criteria) => {
                                    const criteriaScore =
                                      problem.criteria_scores.find(
                                        (score) =>
                                          score.criteria_id === criteria.id
                                      );
                                    return (
                                      <div
                                        key={criteria.id}
                                        className="bg-muted rounded-lg p-3"
                                      >
                                        <div className="flex flex-col items-center">
                                          <span className="text-muted-foreground mb-1 text-xs">
                                            {criteria.name}
                                          </span>
                                          <span
                                            className={`inline-flex h-8 w-8 items-center justify-center rounded-full font-medium ${
                                              (criteriaScore?.score || 0) >= 8
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                                : (criteriaScore?.score || 0) >=
                                                    5
                                                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                                                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                                            }`}
                                          >
                                            {criteriaScore?.score || 0}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                  </Accordion>
                ) : (
                  <div className="text-muted-foreground py-8 text-center">
                    <div className="mb-2">No submissions for this problem</div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <Button
            onClick={() => router.push('/challenges')}
            className="rounded px-4 py-2 font-bold"
          >
            Back to Challenges
          </Button>
        </div>
      </div>
    </div>
  );
}
