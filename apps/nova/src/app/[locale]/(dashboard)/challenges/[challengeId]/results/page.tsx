'use client';

import {
  NovaChallenge,
  NovaProblem,
  NovaSession,
  NovaSubmission,
} from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { ArrowLeft, BookOpen, Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type ReportData = NovaSession & {
  challenge: NovaChallenge & {
    problems: (NovaProblem & {
      submissions: NovaSubmission[];
    })[];
  };
};

interface Props {
  params: Promise<{ challengeId: string }>;
}

export default function Page({ params }: Props) {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { challengeId } = await params;

        const response = await fetch(
          `/api/v1/challenges/${challengeId}/report`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch report data');
        }

        const result = await response.json();

        if (result.status !== 'ENDED') {
          router.push(`/challenges/${challengeId}`);
          return;
        }

        setData(result);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('There was an error fetching the data.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [params, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin" />
          <p className="text-xl font-semibold">Loading your results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="mx-auto max-w-md rounded-xl bg-background p-8 shadow-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/20 text-destructive">
            <X className="h-10 w-10" />
          </div>
          <p className="text-center text-xl font-semibold text-destructive">
            {error}
          </p>
          <Button
            onClick={() => router.push('/challenges')}
            variant="destructive"
            className="mt-6 w-full"
          >
            Back to Challenges
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="mx-auto max-w-md rounded-xl bg-background p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <BookOpen className="h-10 w-10" />
          </div>
          <p className="text-xl font-semibold">No data available</p>
          <p className="mt-2 text-muted-foreground">
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
    <div className="min-h-screen bg-background px-4 py-12 sm:px-6">
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

        <div className="mb-6 rounded-lg bg-primary/10 p-4">
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
