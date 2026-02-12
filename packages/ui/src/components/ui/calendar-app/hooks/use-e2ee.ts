'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from '../../sonner';

// Discriminated union for E2EE status
// Each variant has a `status` discriminant that determines which properties are available
export type E2EEStatus =
  | {
      status: 'disabled';
      reason: string;
    }
  | {
      status: 'no-key';
      // E2EE is enabled on server but workspace has no key yet
    }
  | {
      status: 'enabled';
      createdAt: string;
      unencryptedCount: number;
    }
  | {
      status: 'unknown';
      // Initial/loading state or error state
    };

// Type guard functions for discriminated union
export function isE2EEDisabled(
  status: E2EEStatus | undefined
): status is Extract<E2EEStatus, { status: 'disabled' }> {
  return status?.status === 'disabled';
}

export function isE2EENoKey(
  status: E2EEStatus | undefined
): status is Extract<E2EEStatus, { status: 'no-key' }> {
  return status?.status === 'no-key';
}

export function isE2EEEnabled(
  status: E2EEStatus | undefined
): status is Extract<E2EEStatus, { status: 'enabled' }> {
  return status?.status === 'enabled';
}

export function isE2EEUnknown(
  status: E2EEStatus | undefined
): status is Extract<E2EEStatus, { status: 'unknown' }> {
  return status?.status === 'unknown' || status === undefined;
}

export interface FixProgress {
  progress: number;
  current: number;
  total: number;
  message: string;
}

/**
 * Return type for the useE2EE hook
 */
export interface UseE2EEReturn {
  status: E2EEStatus | undefined;
  isLoading: boolean;
  isVerifying: boolean;
  fixProgress: FixProgress | null;
  hasUnencryptedEvents: boolean;
  enable: () => void;
  isEnabling: boolean;
  migrate: () => void;
  isMigrating: boolean;
  fix: () => void;
  isFixing: boolean;
  verify: () => Promise<void>;
}

export function useE2EE(workspaceId: string): UseE2EEReturn {
  const t = useTranslations('calendar');
  const queryClient = useQueryClient();

  const [isVerifying, setIsVerifying] = useState(false);
  const [fixProgress, setFixProgress] = useState<FixProgress | null>(null);

  const queryKey = ['workspace-e2ee-status', workspaceId];

  // Fetch E2EE status
  const {
    data: status,
    isLoading,
    refetch,
  } = useQuery<E2EEStatus>({
    queryKey,
    queryFn: async (): Promise<E2EEStatus> => {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/encryption`);
      if (!res.ok) return { status: 'unknown' };

      const data = await res.json();

      // Transform API response to discriminated union
      if (!data.enabled) {
        return {
          status: 'disabled',
          reason: data.reason || 'E2EE not available',
        };
      }

      if (!data.hasKey) {
        return { status: 'no-key' };
      }

      return {
        status: 'enabled',
        createdAt: data.createdAt,
        unencryptedCount: data.unencryptedCount ?? 0,
      };
    },
    staleTime: 30 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Enable E2EE mutation
  const enableMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/encryption`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to enable E2EE');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(t('e2ee.key_generated'));
    },
    onError: () => {
      toast.error(t('e2ee.key_generation_failed'));
    },
  });

  // Migrate/encrypt existing events mutation
  const migrateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/encryption/migrate`,
        { method: 'POST' }
      );
      if (!res.ok) throw new Error('Failed to encrypt events');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({
        queryKey: ['databaseCalendarEvents', workspaceId],
      });
      toast.success(
        t('e2ee.migration_success', { count: data.migratedCount || 0 })
      );
    },
    onError: () => {
      toast.error(t('e2ee.migration_failed'));
    },
  });

  // Fix integrity issues mutation (streaming)
  const fixMutation = useMutation({
    mutationFn: async () => {
      setFixProgress({
        progress: 0,
        current: 0,
        total: 0,
        message: 'Starting...',
      });

      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/encryption/fix`,
        { method: 'POST' }
      );

      if (!res.ok) throw new Error('Failed to fix events');
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let lastResult: unknown = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === 'progress') {
              setFixProgress({
                progress: data.progress,
                current: data.current,
                total: data.total,
                message: data.message,
              });
            } else if (data.type === 'complete') {
              lastResult = data;
            }
          } catch {
            // Ignore parse errors for incomplete chunks
          }
        }
      }

      setFixProgress(null);
      return lastResult as {
        success: boolean;
        fixedCount: number;
        errorCount: number;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({
        queryKey: ['databaseCalendarEvents', workspaceId],
      });
      if (data?.fixedCount) {
        toast.success(t('e2ee.fix_success', { count: data.fixedCount }));
      }
      refetch();
    },
    onError: () => {
      setFixProgress(null);
      toast.error(t('e2ee.fix_failed'));
    },
  });

  // Verify encryption status
  const verify = async () => {
    setIsVerifying(true);
    try {
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/encryption/migrate`
      );
      const data = await res.json();

      if (data.verificationStatus === 'verified') {
        toast.success(t('e2ee.verified'));
      } else if (data.verificationStatus === 'integrity_issue') {
        // Auto-fix integrity issues
        setIsVerifying(false);
        fixMutation.mutate();
        return;
      } else {
        toast.info(data.message);
      }
      refetch();
    } catch {
      toast.error(t('e2ee.verification_failed'));
    } finally {
      setIsVerifying(false);
    }
  };

  const hasUnencryptedEvents =
    isE2EEEnabled(status) && status.unencryptedCount > 0;

  return {
    status,
    isLoading,
    isVerifying,
    fixProgress,
    hasUnencryptedEvents,
    enable: enableMutation.mutate,
    isEnabling: enableMutation.isPending,
    migrate: migrateMutation.mutate,
    isMigrating: migrateMutation.isPending,
    fix: fixMutation.mutate,
    isFixing: fixMutation.isPending,
    verify,
  };
}
