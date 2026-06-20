'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenCheck, Loader2, Plus, Sparkles } from '@tuturuuu/icons';
import {
  generateQuizFromLesson,
  getWorkspaceQuizzes,
} from '@tuturuuu/internal-api';
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
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import ClientQuizzes from '../../[lessonId]/client-quizzes';
import DynamicQuizForm from '../../[lessonId]/dynamic-form';

type QuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'matching'
  | 'ordering'
  | 'paragraph'
  | 'mix';

interface ModuleQuestionsManagerProps {
  wsId: string;
  moduleId: string;
  moduleName: string;
}

function ModuleQuestionsManager({
  wsId,
  moduleId,
  moduleName,
}: ModuleQuestionsManagerProps) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);

  // AI configuration states
  const [questionType, setQuestionType] = useState<QuestionType>('mix');
  const [count, setCount] = useState<number>(5);
  const [teacherContext, setTeacherContext] = useState<string>('');

  const queryKey = ['module-quizzes', wsId, moduleId];

  // Fetch quizzes for this module
  const { data: quizzesData, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => getWorkspaceQuizzes(wsId, { moduleId }),
    enabled: Boolean(wsId) && Boolean(moduleId),
  });

  const quizzes = quizzesData?.data ?? [];

  // Mutation for AI generation
  const generateMutation = useMutation({
    mutationFn: (
      payload: {
        questionType?: QuestionType;
        count?: number;
        context?: string;
      } = {}
    ) => generateQuizFromLesson(wsId, { lessonId: moduleId, ...payload }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('ws-quizzes.generation_success'));
        qc.invalidateQueries({ queryKey });
        setShowAiDialog(false);
        // Reset states
        setQuestionType('mix');
        setCount(5);
        setTeacherContext('');
      } else {
        toast.error(t('ws-quizzes.generation_error'));
      }
    },
    onError: () => {
      toast.error(t('ws-quizzes.generation_error'));
    },
  });

  const handleGenerate = () => {
    generateMutation.mutate({
      questionType,
      count,
      context: teacherContext,
    });
  };

  return (
    <div className="border-2 border-border bg-background p-6 shadow-[6px_6px_0_var(--border)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BookOpenCheck className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-black text-base">{moduleName}</h3>
            <p className="text-muted-foreground text-xs">
              {quizzes.length} {t('ws-quizzes.plural').toLowerCase()}
            </p>
          </div>
        </div>

        {!creating && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center gap-1.5 border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)] disabled:opacity-50 whitespace-nowrap"
              onClick={() => setShowAiDialog(true)}
              disabled={generateMutation.isPending}
              type="button"
            >
              {generateMutation.isPending ? (
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
              className="inline-flex items-center gap-1.5 border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)] disabled:opacity-50 whitespace-nowrap"
              onClick={() => setCreating(true)}
              disabled={generateMutation.isPending}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('ws-quizzes.create_manually')}
            </button>
          </div>
        )}
      </div>

      <Separator className="my-4 border-border border-b-2" />

      {creating && (
        <div className="mb-6 border-2 border-border bg-card p-5 shadow-[4px_4px_0_var(--border)]">
          <h4 className="mb-4 font-black text-sm">
            {t('ws-quizzes.manual_create')}
          </h4>
          <DynamicQuizForm
            wsId={wsId}
            moduleId={moduleId}
            onFinish={() => {
              setCreating(false);
              refetch();
            }}
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
      ) : isError ? (
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
        <div className="grid gap-4 md:grid-cols-2">
          <ClientQuizzes wsId={wsId} moduleId={moduleId} quizzes={quizzes} />
        </div>
      )}

      {/* AI Quiz Generation Dialog */}
      <Dialog
        open={showAiDialog}
        onOpenChange={(open) => !generateMutation.isPending && setShowAiDialog(open)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-dynamic-purple" />
              {t('ws-quizzes.generate_with_ai')}
            </DialogTitle>
            <DialogDescription>
              {t('ws-quizzes.generate_with_ai_description')}
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
                onValueChange={(val: QuestionType) => setQuestionType(val)}
                disabled={generateMutation.isPending}
              >
                <SelectTrigger id="ai-question-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mix">
                    {t('ws-quizzes.mix_types')}
                  </SelectItem>
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
                  <SelectItem value="paragraph">
                    {t('ws-quizzes.paragraph') || 'Paragraph'}
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
                disabled={generateMutation.isPending}
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
                disabled={generateMutation.isPending}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <button
              className="border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
              onClick={() => setShowAiDialog(false)}
              disabled={generateMutation.isPending}
              type="button"
            >
              {t('common.cancel')}
            </button>
            <button
              className="inline-flex items-center gap-1.5 border-2 border-border bg-primary px-3 py-1.5 font-bold text-primary-foreground text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              type="button"
            >
              {generateMutation.isPending ? (
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
    </div>
  );
}

interface TestQuestionsSectionProps {
  wsId: string;
  testModules: Array<{ id: string; name: string }>;
}

export function TestQuestionsSection({
  wsId,
  testModules,
}: TestQuestionsSectionProps) {
  return (
    <div className="space-y-6">
      <div className="border-2 border-border bg-background p-6 shadow-[8px_8px_0_var(--border)]">
        <h2 className="font-black text-lg uppercase tracking-wider">
          Test Questions Manager
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Prepare and configure assessment questions manually or using AI for each linked course module.
        </p>
      </div>

      {testModules.length === 0 ? (
        <div className="border-2 border-border border-dashed bg-background p-8 text-center shadow-[4px_4px_0_var(--border)]">
          <p className="text-muted-foreground text-sm">
            Please link modules to this test first to add questions.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {testModules.map((module) => (
            <ModuleQuestionsManager
              key={module.id}
              wsId={wsId}
              moduleId={module.id}
              moduleName={module.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}
