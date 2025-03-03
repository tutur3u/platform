'use client';

import {
  NovaChallenge,
  NovaChallengeStatus,
  NovaProblem,
  NovaSubmission,
} from '@tuturuuu/types/db';
import { useRouter } from 'next/navigation';
import React from 'react';
import { useEffect, useState } from 'react';

type ReportData = NovaChallengeStatus & {
  challenge: NovaChallenge & {
    problems: (NovaProblem & {
      submissions: NovaSubmission[];
    })[];
  };
};
export default function ResultComponent({
  challengeId,
}: {
  challengeId: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const fetchData = async () => {
      try {
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
  }, [router]);
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xl font-semibold text-gray-700">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xl font-semibold text-red-500">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xl font-semibold text-gray-700">No data available</p>
      </div>
    );
  }
  return (
    <div>
      <div className="mx-auto max-w-4xl rounded-lg bg-white p-6 shadow-lg">
        <h1 className="mb-4 text-2xl font-bold text-gray-800">
          Challenge Results
        </h1>
        <div className="mb-6 rounded-lg bg-blue-50 p-4">
          <p className="text-lg font-semibold text-blue-800">
            Total Score: {data.total_score}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full rounded-lg border border-gray-200">
            <thead>
              <tr className="bg-gray-100">
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
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="border px-4 py-2">Problem {index + 1}</td>
                    <td className="border px-4 py-2">
                      {bestSubmission?.user_prompt || 'Not attempted'}
                    </td>
                    <td className="border px-4 py-2 text-center">
                      {bestSubmission?.score || 0}
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
          <button
            onClick={() => router.push('/challenges')}
            className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          >
            Back to Challenges
          </button>
        </div>
      </div>
    </div>
  );
}
