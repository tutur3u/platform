'use client';

import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

interface Props {
  params: Promise<{
    challengeId: string;
  }>;
}

export default function Page({ params }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
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
        // console.log(problemId, 'prob id');
        const response = await fetch(
          `/api/auth/workspace/${challengeId}/nova/report`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch record data in page');
        }

        const result = await response.json();
        setData(result);
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
    return <>Loading...</>; // Show a loading state while fetching data
  }

  if (error) {
    return <>{error}</>; // Show error message if there was an issue
  }

  // Assuming data is structured, display it here
  return (
    <>
      <h1>Problem Details</h1>
      <p>Problem ID: {problemId}</p>
      <pre>{JSON.stringify(data, null, 2)}</pre> {/* Just an example */}
    </>
  );
}
