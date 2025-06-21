'use client';

import { createClient } from '@ncthub/supabase/next/client';
import { useEffect, useState } from 'react';

export function useCurrentUser() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const getUser = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setUserId(user?.id || null);
      } catch (error) {
        console.error('Error getting current user:', error);
        setUserId(null);
      } finally {
        setIsLoading(false);
      }
    };

    getUser();
  }, []);

  return { userId, isLoading };
}
