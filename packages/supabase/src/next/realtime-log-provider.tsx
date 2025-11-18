'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from './client';
import saveRealtimeLogs from './realtime-log-store-actions';

interface RealtimeContextValue {
  wsId: string;
  userId: string | null;
}

const RealtimeLogContext = createContext<RealtimeContextValue | null>(null);

// Module-level storage for context values (accessible outside of React components)
let currentRealtimeContext: RealtimeContextValue | null = null;

export function useRealtimeLogContext() {
  const context = useContext(RealtimeLogContext);
  if (!context) {
    throw new Error(
      'useRealtimeLogContext must be used within a RealtimeLogProvider'
    );
  }
  return context;
}

interface RealtimeProviderProps {
  wsId: string;
  children: React.ReactNode;
}

export function RealtimeLogProvider({ wsId, children }: RealtimeProviderProps) {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // Get initial user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Update module-level context when values change
  useEffect(() => {
    currentRealtimeContext = { wsId, userId };
    return () => {
      currentRealtimeContext = null;
    };
  }, [wsId, userId]);

  return (
    <RealtimeLogContext.Provider value={{ wsId, userId }}>
      {children}
    </RealtimeLogContext.Provider>
  );
}

// Realtime logger for debugging
// Reads wsId and userId from the module-level context
export const realtimeLogger = (kind: string, msg: string, data?: any) => {
  // Only log in development or if explicitly enabled
  if (process.env.NODE_ENV === 'development') {
    const timestamp = new Date().toISOString();
    const prefix = `[Supabase Realtime ${kind.toUpperCase()}]`;
    console.log(`${prefix} ${timestamp}:`, msg, {
      context: currentRealtimeContext,
      data,
    });

    // Save log to the database
    if (currentRealtimeContext) {
      try {
        const { wsId, userId } = currentRealtimeContext;
        saveRealtimeLogs(wsId, userId, kind, msg, data);
      } catch (error) {
        console.error('Failed to save realtime log:', error);
      }
    }
  }
};

// Get log level from environment
export const getRealtimeLogLevel = () => {
  return process.env.NODE_ENV === 'development' ? 'info' : 'error';
};
