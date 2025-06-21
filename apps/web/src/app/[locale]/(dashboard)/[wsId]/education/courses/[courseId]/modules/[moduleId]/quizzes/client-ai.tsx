'use client';

import ClientQuizzes from './client-quizzes';
import { GenerateDialog } from '@/components/generate-dialog';
import { useObject } from '@ncthub/ai/object/core';
import { quizSchema } from '@ncthub/ai/object/types';
import { Button } from '@ncthub/ui/button';
import { toast } from '@ncthub/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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

  const acceptQuizzes = async () => {
    if (!object?.quizzes?.length) return;

    try {
      const promises = object.quizzes.map((quiz) =>
        fetch(`/api/v1/workspaces/${wsId}/quizzes`, {
          method: 'POST',
          body: JSON.stringify({
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
