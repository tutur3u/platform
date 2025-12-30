import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { TaskLabel } from '../types';

interface UseTaskLabelsProps {
  wsId: string;
  initialLabels: TaskLabel[];
}

export function useTaskLabels({ wsId, initialLabels }: UseTaskLabelsProps) {
  const router = useRouter();
  const [labels, setLabels] = useState<TaskLabel[]>(initialLabels);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createLabel = async (data: { name: string; color: string }) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/v1/workspaces/${wsId}/labels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name.trim(),
          color: data.color,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create label');
      }

      const newLabel = await response.json();
      setLabels((prev) => [newLabel, ...prev]);
      router.refresh();
      return { success: true };
    } catch (error) {
      console.error('Error creating label:', error);
      return { success: false, error };
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateLabel = async (
    labelId: string,
    data: { name: string; color: string }
  ) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/labels/${labelId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: data.name.trim(),
            color: data.color,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update label');
      }

      const updatedLabel = await response.json();
      setLabels((prev) =>
        prev.map((label) => (label.id === labelId ? updatedLabel : label))
      );
      router.refresh();
      return { success: true };
    } catch (error) {
      console.error('Error updating label:', error);
      return { success: false, error };
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteLabel = async (labelId: string) => {
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/labels/${labelId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete label');
      }

      setLabels((prev) => prev.filter((label) => label.id !== labelId));
      router.refresh();
      return { success: true };
    } catch (error) {
      console.error('Error deleting label:', error);
      return { success: false, error };
    }
  };

  return {
    labels,
    isSubmitting,
    createLabel,
    updateLabel,
    deleteLabel,
  };
}
