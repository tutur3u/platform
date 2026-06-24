'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  generateQuizFromLesson,
  getWorkspaceQuizzes,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';

export function useQuizzes(wsId: string, lessonId: string) {
  const t = useTranslations();
  const qc = useQueryClient();
  const queryKey = ['module-quizzes', wsId, lessonId];

  const query = useQuery({
    queryKey,
    queryFn: () => getWorkspaceQuizzes(wsId, { moduleId: lessonId }),
    enabled: Boolean(wsId) && Boolean(lessonId),
  });

  const generateMutation = useMutation({
    mutationFn: (
      payload: {
        questionType?:
          | 'multiple_choice'
          | 'true_false'
          | 'matching'
          | 'ordering'
          | 'paragraph'
          | 'mix';
        count?: number;
        context?: string;
      } = {}
    ) => generateQuizFromLesson(wsId, { lessonId, ...payload }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('ws-quizzes.generation_success'));
        qc.invalidateQueries({ queryKey });
      } else {
        toast.error(t('ws-quizzes.generation_error'));
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('ws-quizzes.generation_error')
      );
    },
  });

  return {
    quizzes: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    generateQuiz: generateMutation.mutate,
    isGenerating: generateMutation.isPending,
  };
}
