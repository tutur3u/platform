'use client';

// import { getChallenge } from '../../challenges';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

interface Props {
  params: Promise<{ challengeId: string }>;
}

interface ReportData {
  user_prompt: string;
  score: number;
  feedback: string;
}

export default function Page({ params }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReportData[]>([]); // Fix: Set type as an array of objects
  const [problemId, setProblemId] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { challengeId } = await params;
        setProblemId(challengeId);

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) {
          console.log('Unauthorized');
          router.push('/login');
          return;
        }

        const response = await fetch(
          `/api/auth/workspace/${challengeId}/nova/report`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch record data in page');
        }

        const result = await response.json();

        // Ensure result is an array
        const realData = Array.isArray(result) ? result : [result];

        setData(realData);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('There was an error fetching the data.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [params, supabase.auth, router]);

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

  return (
    <div className="mx-auto max-w-4xl rounded-lg bg-white p-6 shadow-lg">
      <h1 className="mb-4 text-2xl font-bold text-gray-800">Problem Details</h1>
      <p className="mb-4 text-gray-700">
        <strong>Problem ID:</strong> {problemId}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full rounded-lg border border-gray-200">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-4 py-2 text-left">User Statement</th>
              <th className="border px-4 py-2 text-left">User Prompt</th>
              <th className="border px-4 py-2 text-center">Score</th>
              <th className="border px-4 py-2 text-left">Feedback</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="border px-4 py-2">{item.user_prompt}</td>
                <td className="border px-4 py-2">{item.user_prompt}</td>
                <td className="border px-4 py-2 text-center">{item.score}</td>
                <td className="border px-4 py-2">{item.feedback}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
