'use client';

import { useObject } from '@tuturuuu/ai/object/core';
import { quizSchema } from '@tuturuuu/ai/object/types';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { GenerateDialog } from '@/components/generate-dialog';
import ClientQuizzes from './client-quizzes';

export default function AIQuizzes({
  wsId,
  courseId,
  moduleId,
  moduleName,
}: {
  wsId: string;
  courseId: string;
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
          name: `Quizzes For ${moduleName}`,
          moduleId,
        }),
      });
      if (!quizSetRes.ok) throw new Error('Failed to create quiz set');
      const quizSet = await quizSetRes.json();

      await fetch(`/api/v1/workspaces/${wsId}/quizzes`, {
        method: 'POST',
        body: JSON.stringify({
          setId: quizSet.setId,
          moduleId,
          quizzes: object.quizzes,
        }),
      });

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
              courseId={courseId}
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
