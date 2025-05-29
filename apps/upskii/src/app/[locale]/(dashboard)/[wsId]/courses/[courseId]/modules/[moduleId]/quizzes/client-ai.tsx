'use client';

import ClientQuizzes from './client-quizzes';
import { GenerateDialog } from '@/components/generate-dialog';
import { useObject } from '@tuturuuu/ai/object/core';
import { quizSchema } from '@tuturuuu/ai/object/types';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AIQuizzes({
  wsId,
  moduleId,
  moduleName,
}: {
  wsId: string;
  moduleId: string;
  moduleName: string;
}) {
  const t = useTranslations();
  const router = useRouter();

  const { object, submit, isLoading } = useObject({
    api: '/api/ai/objects/quizzes',
    schema: quizSchema,
  });

  const [context, setContext] = useState('');
  const [accepted, setAccepted] = useState(false);

  const acceptQuizzes = async () => {
    if (!object?.quizzes?.length) return;

    try {
      // Step 1: Create a quiz set (if needed)
      const quizSetRes = await fetch(`/api/v1/workspaces/${wsId}/quiz-sets`, {
        method: 'POST',
        body: JSON.stringify({
          name: 'Quizzes For ' + moduleName,
          moduleId,
        }),
      });
      if (!quizSetRes.ok) throw new Error('Failed to create quiz set');
      const quizSet = await quizSetRes.json();

      const promises = object.quizzes.map((quiz) =>
        fetch(`/api/v1/workspaces/${wsId}/quizzes`, {
          method: 'POST',
          body: JSON.stringify({
            setId: quizSet.id,
            moduleId,
            question: quiz?.question,
            quiz_options: quiz?.quiz_options,
          }),
        })
      );

      await Promise.all(promises);

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
            <Button variant="outline" onClick={acceptQuizzes}>
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
