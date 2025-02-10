'use client';

import ClientFlashcards from './client-flashcards';
import { GenerateDialog } from '@/components/generate-dialog';
import { useObject } from '@tutur3u/ai/object/core';
import { flashcardSchema } from '@tutur3u/ai/object/types';
import { Button } from '@tutur3u/ui/components/ui/button';
import { toast } from '@tutur3u/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function AIFlashcards({
  wsId,
  moduleId,
}: {
  wsId: string;
  moduleId: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { object, submit, isLoading } = useObject({
    api: '/api/ai/objects/flashcards',
    schema: flashcardSchema,
  });

  const [context, setContext] = useState('');
  const [accepted, setAccepted] = useState(false);

  const acceptFlashcards = async () => {
    if (!object?.flashcards?.length) return;

    try {
      const promises = object.flashcards.map((card) =>
        fetch(`/api/v1/workspaces/${wsId}/flashcards`, {
          method: 'POST',
          body: JSON.stringify({
            moduleId,
            front: card?.front,
            back: card?.back,
          }),
        })
      );

      await Promise.all(promises);

      toast({
        title: t('common.success'),
        description: t('ws-flashcards.generation_accepted'),
      });

      router.refresh();
      setAccepted(true);
    } catch (e) {
      console.log(e);
      toast({
        title: t('common.error'),
        description: t('ws-flashcards.generation_error'),
      });
    }
  };

  const cards = object?.flashcards?.map((fc, idx) => ({
    id: idx.toString(),
    front: fc?.front || '...',
    back: fc?.back || '...',
    width: '100%',
    frontCardStyle: {
      color: 'hsl(var(--green))',
      backgroundColor: 'hsl(var(--green) / 0.05)',
      borderColor: 'hsl(var(--green))',
    },
    frontHTML: (
      <div className="border-dynamic-green/10 flex h-full w-full items-center justify-center rounded-2xl border p-4 text-center font-semibold">
        {fc?.front || '...'}
      </div>
    ),
    backCardStyle: {
      color: 'hsl(var(--purple))',
      backgroundColor: 'hsl(var(--purple) / 0.05)',
      borderColor: 'hsl(var(--purple))',
    },
    backHTML: (
      <div className="border-dynamic-purple/10 flex h-full w-full items-center justify-center rounded-2xl border p-4 text-center font-semibold">
        {fc?.back || '...'}
      </div>
    ),
  }));

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

      {!accepted && cards && cards.length > 0 && (
        <>
          <div className="flex justify-end gap-2">
            <Button
              variant="destructive"
              onClick={() => submit({ wsId, context })}
            >
              {t('common.regenerate')}
            </Button>
            <Button variant="outline" onClick={acceptFlashcards}>
              {t('common.accept')}
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <ClientFlashcards
              wsId={wsId}
              moduleId="ai-generated"
              cards={cards}
            />
          </div>
        </>
      )}
    </div>
  );
}
