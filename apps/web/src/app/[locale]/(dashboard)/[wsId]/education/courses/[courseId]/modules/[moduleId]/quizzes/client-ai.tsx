'use client';

import { useMutation } from '@tanstack/react-query';
import { useObject } from '@tuturuuu/ai/object/core';
import { quizSchema } from '@tuturuuu/ai/object/types';
import type { UpsertWorkspaceQuizPayload } from '@tuturuuu/internal-api';
import { createWorkspaceQuiz } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { GenerateDialog } from '@/components/generate-dialog';
import ClientQuizzes from './client-quizzes';

export default function AIQuizzes({
  wsId,
  moduleId,
}: {
  wsId: string;
  moduleId: string;
}) {
  const t = useTranslations();
  const router = useRouter();

  const { object, submit, isLoading } = useObject({
    api: '/api/ai/objects/quizzes',
    schema: quizSchema,
  });

  const [context, setContext] = useState('');
  const [accepted, setAccepted] = useState(false);

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!object?.quizzes?.length) return;

      const quizzes: UpsertWorkspaceQuizPayload[] = object.quizzes
        .map((quiz) => {
          const question = quiz?.question?.trim() ?? '';
          const quizOptions = (quiz?.quiz_options ?? []).reduce<
            UpsertWorkspaceQuizPayload['quiz_options']
          >((acc, option) => {
            if (!option || typeof option.value !== 'string') return acc;
            if (option.value.trim().length === 0) return acc;
            if (typeof option.is_correct !== 'boolean') return acc;

            acc.push({
              explanation:
                typeof option.explanation === 'string'
                  ? option.explanation
                  : undefined,
              is_correct: option.is_correct,
              value: option.value.trim(),
            });
            return acc;
          }, []);

          return {
            question,
            quiz_options: quizOptions,
          };
        })
        .filter(
          (quiz) => quiz.question.length > 0 && quiz.quiz_options.length >= 2
        );

      if (quizzes.length === 0) {
        throw new Error('No valid quizzes generated');
      }

      await createWorkspaceQuiz(wsId, {
        moduleId,
        quizzes,
      });
    },
  });

  const acceptQuizzes = async () => {
    if (!object?.quizzes?.length) return;

    try {
      await acceptMutation.mutateAsync();

      toast({
        title: t('common.success'),
        description: t('ws-quizzes.generation_accepted'),
      });

      router.refresh();
      setAccepted(true);
    } catch (e) {
      console.log(e);
      toast({
        title: t('common.error'),
        description: t('ws-quizzes.generation_error'),
      });
    }
  };

  return (
    <div className="space-y-4">
      <GenerateDialog
        title={t('common.generate_with_ai')}
        description={t('ws-quizzes.create_description')}
        isLoading={isLoading}
        onGenerate={(context) => {
          setAccepted(false);
          setContext(context);
          submit({ wsId, context });
        }}
      />

      {!accepted && object?.quizzes && object.quizzes.length > 0 && (
        <>
          <div className="flex justify-end gap-2">
            <Button
              variant="destructive"
              onClick={() => submit({ wsId, context })}
            >
              {t('common.regenerate')}
            </Button>
            <Button
              variant="outline"
              onClick={acceptQuizzes}
              disabled={acceptMutation.isPending}
            >
              {t('common.accept')}
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <ClientQuizzes
              wsId={wsId}
              moduleId="ai-generated"
              quizzes={object.quizzes}
              previewMode
            />
          </div>
        </>
      )}
    </div>
  );
}
