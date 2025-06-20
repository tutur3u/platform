import FlashcardForm from '../../../../../flashcards/form';
import { AIFlashcards } from './client-ai';
import ClientFlashcards from './client-flashcards';
import { getFeatureFlags } from '@/constants/secrets';
import { createClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { SwatchBook } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export default async function ModuleFlashcardsPage({ params }: Props) {
  const { wsId, moduleId } = await params;
  const t = await getTranslations();
  const flashcards = await getFlashcards(moduleId);
  const { ENABLE_AI } = await getFeatureFlags(wsId);
  const cards = flashcards.map((fc) => ({
    id: fc.id,
    front: fc.front,
    back: fc.back,
    width: '100%',
    frontCardStyle: {
      color: 'hsl(var(--green))',
      backgroundColor: 'hsl(var(--green) / 0.05)',
      borderColor: 'hsl(var(--green))',
    },
    frontHTML: (
      <div className="flex h-full w-full items-center justify-center rounded-2xl border border-dynamic-green/10 p-4 text-center font-semibold">
        {fc?.front || '...'}
      </div>
    ),
    backCardStyle: {
      color: 'hsl(var(--purple))',
      backgroundColor: 'hsl(var(--purple) / 0.05)',
      borderColor: 'hsl(var(--purple))',
    },
    backHTML: (
      <div className="flex h-full w-full items-center justify-center rounded-2xl border border-dynamic-purple/10 p-4 text-center font-semibold">
        {fc?.back || '...'}
      </div>
    ),
  }));

  return (
    <div className="grid gap-4">
      <FeatureSummary
        title={
          <div className="flex items-center justify-between gap-4">
            <h1 className="flex w-full items-center gap-2 text-lg font-bold md:text-2xl">
              <SwatchBook className="h-5 w-5" />
              {t('ws-flashcards.plural')}
            </h1>
          </div>
        }
        pluralTitle={t('ws-flashcards.plural')}
        singularTitle={t('ws-flashcards.singular')}
        createTitle={t('ws-flashcards.create')}
        createDescription={t('ws-flashcards.create_description')}
        form={<FlashcardForm wsId={wsId} moduleId={moduleId} />}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {flashcards && flashcards.length > 0 && (
          <>
            <ClientFlashcards wsId={wsId} moduleId={moduleId} cards={cards} />
            <Separator className="col-span-full my-2" />
          </>
        )}

        {ENABLE_AI ? (
          <div className="col-span-full">
            <AIFlashcards wsId={wsId} moduleId={moduleId} />
          </div>
        ) : undefined}
      </div>
    </div>
  );
}

const getFlashcards = async (moduleId: string) => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('course_module_flashcards')
    .select('...workspace_flashcards(*)')
    .eq('module_id', moduleId);

  if (error) {
    console.error('error', error);
  }

  return data || [];
};
