'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { useEffect, useState } from 'react';

export function useCurrentUser() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    const init = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (isMounted) setUserId(user?.id || null);
      } catch (error) {
        console.error('Error getting current user:', error);
        if (isMounted) setUserId(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (isMounted) setUserId(session?.user?.id ?? null);
      }
    );

    void init();
    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  return { userId, isLoading };
}
