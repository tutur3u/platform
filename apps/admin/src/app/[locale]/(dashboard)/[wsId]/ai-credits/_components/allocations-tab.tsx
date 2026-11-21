'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AllocationCard } from './allocation-card';
import type { Allocation } from './allocation-types';
import { EditAllocationDialog } from './edit-allocation-dialog';

export default function AllocationsTab() {
  const t = useTranslations('ai-credits-admin');
  const queryClient = useQueryClient();
  const [editingAlloc, setEditingAlloc] = useState<Allocation | null>(null);

  const { data: allocations, isLoading } = useQuery<Allocation[]>({
    queryKey: ['admin', 'ai-credits', 'allocations'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/ai-credits/allocations', {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to fetch allocations');
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Allocation> & { id: string }) => {
      const res = await fetch('/api/v1/admin/ai-credits/allocations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'ai-credits', 'allocations'],
      });
      if (data?.balances_updated != null && data.balances_updated > 0) {
        toast.success(
          t('allocation_updated_with_balances', {
            count: data.balances_updated,
          })
        );
      } else {
        toast.success(t('allocation_updated'));
      }
      setEditingAlloc(null);
    },
    onError: () => toast.error(t('update_failed')),
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-20 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-2">
        {(allocations ?? []).map((alloc) => (
          <AllocationCard
            key={alloc.id}
            allocation={alloc}
            t={t}
            onEdit={() => setEditingAlloc(alloc)}
            onToggleActive={(checked) =>
              updateMutation.mutate({
                id: alloc.id,
                is_active: checked,
              })
            }
          />
        ))}
      </div>

      {editingAlloc && (
        <EditAllocationDialog
          allocation={editingAlloc}
          onSave={(updates) =>
            updateMutation.mutate({ id: editingAlloc.id, ...updates })
          }
          onClose={() => setEditingAlloc(null)}
          isPending={updateMutation.isPending}
          t={t}
        />
      )}
    </>
  );
}
