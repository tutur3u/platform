import { useTimezone } from '../context/timezone-context';
import { useEffect, useState } from 'react';

interface UseTimezonePlansOptions {
  planId?: string;
  includeTimezoneInfo?: boolean;
}

export function useTimezonePlans(options: UseTimezonePlansOptions = {}) {
  const { planId, includeTimezoneInfo = true } = options;
  const { userTimezone } = useTimezone();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true);
        setError(null);

        const url = planId
          ? `/api/meet-together/plans/${planId}?timezone=${encodeURIComponent(userTimezone)}`
          : `/api/meet-together/plans?timezone=${encodeURIComponent(userTimezone)}`;

        const response = await fetch(url, {
          headers: {
            'x-user-timezone': userTimezone,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        console.error('Error fetching plans:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, [planId, userTimezone, includeTimezoneInfo]);

  return { data, loading, error };
}
