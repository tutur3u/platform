import FlashcardForm from '../../../../../flashcards/form';
import ClientFlashcards from './client-flashcards';
import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { SwatchBook } from 'lucide-react';
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

  const cards = flashcards.map((fc) => ({
    id: fc.id,
    front: fc.front,
    back: fc.back,
    width: '100%',
    frontCardStyle: {
      color: 'var(--foreground)',
      backgroundColor: 'hsl(var(--foreground) / 0.05)',
    },
    frontHTML: (
      <div className="flex h-full w-full items-center justify-center rounded-xl border p-4 text-center text-lg font-semibold md:text-2xl">
        {fc.front}
      </div>
    ),
    backCardStyle: {
      color: 'var(--foreground)',
      backgroundColor: 'hsl(var(--foreground) / 0.05)',
    },
    backHTML: (
      <div className="flex h-full w-full items-center justify-center rounded-xl border p-4 text-center text-lg font-semibold md:text-2xl">
        {fc.back}
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
          <ClientFlashcards wsId={wsId} moduleId={moduleId} cards={cards} />
        )}
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
