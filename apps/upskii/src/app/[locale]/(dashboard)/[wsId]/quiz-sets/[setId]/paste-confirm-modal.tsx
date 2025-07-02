import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { CheckCircle, X, XCircle } from '@tuturuuu/ui/icons';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';
import React from 'react';

export default function PasteConfirmModal({
  pastedQuizzes,
  appendQuiz,
  setShowPasteConfirm,
  setPastedQuizzes,
}: {
  pastedQuizzes: any[];
  appendQuiz: (quiz: any) => void;
  setShowPasteConfirm: (show: boolean) => void;
  setPastedQuizzes: (quizzes: any[]) => void;
}) {
  const t = useTranslations('ws-quizzes.form');
  const confirmPaste = () => {
    pastedQuizzes.forEach((quiz) => {
      const cleanQuiz = {
        ...quiz,
        id: undefined, // Remove ID to create new quiz
        quiz_options: quiz.quiz_options.map((option: any) => ({
          ...option,
          id: undefined, // Remove ID to create new options
        })),
      };
      appendQuiz(cleanQuiz);
    });

    setShowPasteConfirm(false);
    setPastedQuizzes([]);

    toast({
      title: t('success.title'),
      description:
        pastedQuizzes.length > 1
          ? t('success.paste-success-many', {
              length: pastedQuizzes.length,
            })
          : t('success.paste-success-one'),
    });
  };

  const discardPaste = () => {
    setShowPasteConfirm(false);
    setPastedQuizzes([]);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary/50">
      <Card className="mx-4 w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-dynamic-purple text-lg">
            {t('paste-confirm-modal.title')}
          </CardTitle>
          <CardDescription>
            {pastedQuizzes.length > 1
              ? t('paste-confirm-modal.description-plural', {
                  length: pastedQuizzes.length,
                })
              : t('paste-confirm-modal.description-single')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScrollArea className="max-h-96">
            <div className="space-y-4">
              {pastedQuizzes.map((quiz, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-dynamic-purple/40 bg-dynamic-light-purple/5 p-4"
                >
                  <h4 className="mb-2 font-semibold text-dynamic-purple">
                    {t('question-no', {
                      no: index + 1,
                    })}
                    : {quiz.question || t('untitled-question')}
                  </h4>
                  <div className="space-y-1.5 px-1 text-muted-foreground text-sm">
                    {quiz.quiz_options?.map((option: any, optIndex: number) => (
                      <div key={optIndex} className="flex items-center gap-2">
                        {option.is_correct ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span>
                          {option.value ||
                            t('option-no', {
                              no: optIndex + 1,
                            })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={discardPaste}
              className="border-muted-foreground text-secondary-foreground hover:bg-dynamic-pink/50"
            >
              <X className="mr-2 h-4 w-4" />
              {t('paste-confirm-modal.discard-button')}
            </Button>
            <Button
              onClick={confirmPaste}
              className="border border-dynamic-purple bg-dynamic-purple/30 text-dynamic-light-purple hover:bg-dynamic-purple/60 hover:text-primary"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {t('paste-confirm-modal.confirm-button')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
