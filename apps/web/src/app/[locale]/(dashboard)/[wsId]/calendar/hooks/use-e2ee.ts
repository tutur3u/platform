'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export interface E2EEStatus {
  enabled: boolean;
  hasKey: boolean;
  reason?: string;
  createdAt?: string | null;
  unencryptedCount?: number;
}

export interface FixProgress {
  progress: number;
  current: number;
  total: number;
  message: string;
}

export function useE2EE(workspaceId: string) {
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
    queryFn: async () => {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/encryption`);
      if (!res.ok) return { enabled: false, hasKey: false };
      return res.json();
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
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
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
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
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

  const hasUnencryptedEvents = Boolean(
    status?.hasKey && (status?.unencryptedCount ?? 0) > 0
  );

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
