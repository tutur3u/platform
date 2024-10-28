'use client';

import FlashcardForm from '../../../../../flashcards/form';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@repo/ui/components/ui/alert-dialog';
import { Button } from '@repo/ui/components/ui/button';
import { Pencil, Trash, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Flashcard } from 'react-quizlet-flashcard';

export default function ClientFlashcards({
  wsId,
  moduleId,
  cards,
  previewMode = false,
}: {
  wsId: string;
  moduleId: string;
  cards: Array<{
    id: string;
    front: string;
    back: string;
    frontHTML: string | JSX.Element;
    backHTML: string | JSX.Element;
    frontCardStyle?: React.CSSProperties;
    frontContentStyle?: React.CSSProperties;
    backCardStyle?: React.CSSProperties;
    backContentStyle?: React.CSSProperties;
    className?: string;
    height?: string;
    width?: string;
    borderRadius?: string;
    style?: React.CSSProperties;
  }>;
  previewMode?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations();
  const supabase = createClient();
  const [editingCardId, setEditingCardId] = useState<string | null>(null);

  const onDelete = async (id: string) => {
    const { error } = await supabase
      .from('workspace_flashcards')
      .delete()
      .eq('id', id);

    if (error) {
      console.log(error);
      return;
    }

    router.refresh();
  };

  return (
    <>
      {cards.map((card) => (
        <div
          key={card.id}
          className={cn(
            previewMode ||
              'bg-foreground/5 border-foreground/5 rounded-lg border p-2 md:p-4'
          )}
        >
          {editingCardId === card.id ? (
            <>
              <FlashcardForm
                wsId={wsId}
                moduleId={moduleId}
                data={{
                  id: card.id,
                  ws_id: wsId,
                  front: card.front,
                  back: card.back,
                }}
                onFinish={() => setEditingCardId(null)}
              />
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditingCardId(null)}>
                  <X className="h-5 w-5" />
                  {t('common.cancel')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Flashcard
                frontHTML={card.frontHTML}
                backHTML={card.backHTML}
                frontCardStyle={card.frontCardStyle}
                frontContentStyle={card.frontContentStyle}
                backCardStyle={card.backCardStyle}
                backContentStyle={card.backContentStyle}
                className={card.className}
                height={card.height}
                width={card.width}
                borderRadius={card.borderRadius}
                style={card.style}
              />
              {previewMode || (
                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button onClick={() => setEditingCardId(card.id)}>
                    <Pencil className="h-5 w-5" />
                    {t('common.edit')}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">
                        <Trash className="h-5 w-5" />
                        {t('common.delete')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t('common.confirm_delete_title')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('common.confirm_delete_description')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {t('common.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDelete(card.id)}>
                          {t('common.continue')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </>
  );
}
