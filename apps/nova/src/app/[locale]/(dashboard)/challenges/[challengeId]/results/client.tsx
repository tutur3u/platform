'use client';

import {
  NovaChallenge,
  NovaChallengeCriteria,
  NovaProblem,
  NovaProblemCriteriaScore,
  NovaSession,
  NovaSubmission,
} from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { ArrowLeft, BookOpen } from '@tuturuuu/ui/icons';
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
        <div className="bg-background mx-auto max-w-md rounded-xl p-8 text-center shadow-xl">
          <div className="bg-muted text-muted-foreground mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
            <BookOpen className="h-10 w-10" />
          </div>
          <p className="text-xl font-semibold">No data available</p>
          <p className="text-muted-foreground mt-2">
            We couldn't find any results for this challenge.
          </p>
          <Button
            onClick={() => router.push('/challenges')}
            className="mt-6 w-full"
          >
            Back to Challenges
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center">
          <Button
            onClick={() => router.push('/challenges')}
            variant="outline"
            className="mr-4 flex h-10 w-10 items-center justify-center rounded-full p-2"
          >
            <ArrowLeft className="h-10 w-10" />
          </Button>
          <h1 className="text-3xl font-bold">Challenge Results</h1>
        </div>

        <div className="bg-primary/10 mb-6 rounded-lg p-4">
          <p className="text-lg font-semibold">
            Total Score: {data.total_score}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full rounded-lg border">
            <thead>
              <tr className="bg-muted">
                <th className="border px-4 py-2 text-left">Problem</th>
                <th className="border px-4 py-2 text-left">Your Solution</th>
                <th className="border px-4 py-2 text-center">Score</th>
                <th className="border px-4 py-2 text-left">Feedback</th>
              </tr>
            </thead>
            <tbody>
              {data.challenge.problems.map((problem, index) => {
                const bestSubmission = problem.submissions.sort(
                  (a, b) => (b.score || 0) - (a.score || 0)
                )[0];

                return (
                  <tr key={index} className="hover:bg-muted/50">
                    <td className="border px-4 py-2">Problem {index + 1}</td>
                    <td className="border px-4 py-2">
                      {bestSubmission?.prompt || 'Not attempted'}
                    </td>
                    <td className="border px-4 py-2 text-center">
                      {`${bestSubmission?.score || 0}/10`}
                    </td>
                    <td className="border px-4 py-2">
                      {bestSubmission?.feedback || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {data.challenge.criteria.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-4 text-2xl font-bold">Criteria Scores</h2>
            <div className="overflow-x-auto">
              <table className="w-full rounded-lg border">
                <thead>
                  <tr className="bg-muted">
                    <th className="border px-4 py-2 text-left">Problem</th>
                    {data.challenge.criteria.map((criteria) => (
                      <th
                        key={criteria.id}
                        className="border px-4 py-2 text-center"
                      >
                        {criteria.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.challenge.problems.map((problem, index) => (
                    <tr key={index} className="hover:bg-muted/50">
                      <td className="border px-4 py-2">Problem {index + 1}</td>
                      {data.challenge.criteria.map((criteria) => {
                        const criteriaScore = problem.criteria_scores.find(
                          (score) => score.criteria_id === criteria.id
                        );
                        return (
                          <td
                            key={criteria.id}
                            className="border px-4 py-2 text-center"
                          >
                            <div className="flex flex-col items-center">
                              <span
                                className={`font-medium ${
                                  (criteriaScore?.score || 0) >= 8
                                    ? 'text-green-600'
                                    : (criteriaScore?.score || 0) >= 5
                                      ? 'text-yellow-600'
                                      : 'text-red-600'
                                }`}
                              >
                                {criteriaScore?.score || 0}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                {criteria.description}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-center">
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
