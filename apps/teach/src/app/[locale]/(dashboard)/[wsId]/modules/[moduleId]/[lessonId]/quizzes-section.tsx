'use client';

import { ListTodo, Loader2, Plus, Sparkles } from '@tuturuuu/icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import ClientQuizzes from './client-quizzes';
import DynamicQuizForm from './dynamic-form';
import { useQuizzes } from './use-quizzes';

interface Props {
  wsId: string;
  lessonId: string; // The course module ID
}

type QuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'matching'
  | 'ordering'
  | 'mix';

export default function LessonQuizzesSection({ wsId, lessonId }: Props) {
  const t = useTranslations();
  const [creating, setCreating] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);

  // Dialog configuration states
  const [questionType, setQuestionType] = useState<QuestionType>('mix');
  const [count, setCount] = useState<number>(5);
  const [teacherContext, setTeacherContext] = useState<string>('');

  const { quizzes, isLoading, isError, refetch, generateQuiz, isGenerating } =
    useQuizzes(wsId, lessonId);

  const handleGenerate = () => {
    generateQuiz(
      {
        questionType,
        count,
        context: teacherContext,
      },
      {
        onSuccess: () => {
          setShowAiDialog(false);
          // Reset dialog states
          setQuestionType('mix');
          setCount(5);
          setTeacherContext('');
        },
      }
    );
  };

  return (
    <section className="mt-8 space-y-4 border-2 border-border bg-background p-6 shadow-[5px_5px_0_var(--border)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ListTodo className="h-5 w-5 text-dynamic-purple" />
          <h2 className="font-black text-lg">
            {t('ws-quizzes.plural')} ({quizzes.length})
          </h2>
        </div>
        {!creating && (
          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-1.5 border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)] disabled:opacity-50"
              onClick={() => setShowAiDialog(true)}
              disabled={isGenerating}
              type="button"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('ws-quizzes.generating_with_ai')}
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-dynamic-purple" />
                  {t('ws-quizzes.generate_with_ai')}
                </>
              )}
            </button>

            <button
              className="inline-flex items-center gap-1.5 border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)] disabled:opacity-50"
              onClick={() => setCreating(true)}
              disabled={isGenerating}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('ws-quizzes.create_manually')}
            </button>
          </div>
        )}
      </div>

      <Separator className="border-border border-b-2" />

      {creating && (
        <div className="border-2 border-border bg-card p-5 shadow-[4px_4px_0_var(--border)]">
          <h3 className="mb-4 font-black text-md">
            {t('ws-quizzes.manual_create')}
          </h3>
          <DynamicQuizForm
            wsId={wsId}
            moduleId={lessonId}
            onFinish={() => {
              setCreating(false);
              refetch();
            }}
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
      ) : isError && quizzes.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t('ws-quizzes.load_error')}
        </p>
      ) : quizzes.length === 0 ? (
        !creating && (
          <p className="text-muted-foreground text-sm">
            {t('ws-quizzes.empty_module')}
          </p>
        )
      ) : (
        <>
          {isError && (
            <p className="text-muted-foreground text-sm">
              {t('ws-quizzes.load_error')}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <ClientQuizzes wsId={wsId} moduleId={lessonId} quizzes={quizzes} />
          </div>
        </>
      )}

      {/* AI Quiz Generation configuration Dialog */}
      <Dialog
        open={showAiDialog}
        onOpenChange={(open) => !isGenerating && setShowAiDialog(open)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-dynamic-purple" />
              {t('ws-quizzes.generate_with_ai')}
            </DialogTitle>
            <DialogDescription>
              Configure the type and quantity of questions to generate from this
              lesson.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Question Type */}
            <div className="space-y-2">
              <Label htmlFor="ai-question-type">
                {t('ws-quizzes.question_type')}
              </Label>
              <Select
                value={questionType}
                onValueChange={(val: any) => setQuestionType(val)}
                disabled={isGenerating}
              >
                <SelectTrigger id="ai-question-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mix">Mix Types</SelectItem>
                  <SelectItem value="multiple_choice">
                    {t('ws-quizzes.multiple_choice')}
                  </SelectItem>
                  <SelectItem value="true_false">
                    {t('ws-quizzes.true_false')}
                  </SelectItem>
                  <SelectItem value="matching">
                    {t('ws-quizzes.matching')}
                  </SelectItem>
                  <SelectItem value="ordering">
                    {t('ws-quizzes.ordering')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Question Count */}
            <div className="space-y-2">
              <Label htmlFor="ai-question-count">Number of Questions</Label>
              <Input
                id="ai-question-count"
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) =>
                  setCount(
                    Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1))
                  )
                }
                disabled={isGenerating}
              />
            </div>

            {/* Custom context */}
            <div className="space-y-2">
              <Label htmlFor="ai-teacher-context">
                Additional Context (Optional)
              </Label>
              <Textarea
                id="ai-teacher-context"
                placeholder="e.g. Focus on coding examples, make it hard, etc."
                value={teacherContext}
                onChange={(e) => setTeacherContext(e.target.value)}
                disabled={isGenerating}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <button
              className="border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
              onClick={() => setShowAiDialog(false)}
              disabled={isGenerating}
              type="button"
            >
              {t('common.cancel')}
            </button>
            <button
              className="inline-flex items-center gap-1.5 border-2 border-border bg-primary px-3 py-1.5 font-bold text-primary-foreground text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
              onClick={handleGenerate}
              disabled={isGenerating}
              type="button"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('ws-quizzes.generating_with_ai')}
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('ws-quizzes.generate_with_ai')}
                </>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
