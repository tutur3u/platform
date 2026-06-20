'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader, Plus, Trash } from '@tuturuuu/icons';
import {
  createWorkspaceCourseTestQuestions,
  createWorkspaceQuiz,
  updateWorkspaceQuiz,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  wsId: string;
  moduleId: string;
  courseId?: string;
  testId?: string;
  data?: {
    id?: string;
    question?: string;
    type?: string;
    content?: any;
    answer?: any;
  };
  onFinish?: () => void;
}

export default function DynamicQuizForm({
  wsId,
  moduleId,
  courseId,
  testId,
  data,
  onFinish,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Form State
  const [question, setQuestion] = useState(data?.question || '');
  const [type, setType] = useState<
    'multiple_choice' | 'true_false' | 'matching' | 'ordering' | 'paragraph'
  >((data?.type as any) || 'multiple_choice');

  // True / False State
  const [tfAnswer, setTfAnswer] = useState<boolean>(
    data?.answer?.correct !== undefined ? data.answer.correct : true
  );

  // Multiple Choice State
  const [mcOptions, setMcOptions] = useState<string[]>(
    data?.content?.options || ['', '']
  );
  const [mcAnswer, setMcAnswer] = useState<number>(
    data?.answer?.correctIndex !== undefined ? data.answer.correctIndex : 0
  );

  // Matching State
  const [matchingPairs, setMatchingPairs] = useState<
    Array<{ left: string; right: string }>
  >(data?.content?.pairs || [{ left: '', right: '' }]);

  // Ordering State
  const [orderingItems, setOrderingItems] = useState<string[]>(
    data?.content?.items || ['', '']
  );

  // Mutation for Save
  const saveMutation = useMutation({
    mutationFn: async () => {
      let payloadContent: any = {};
      let payloadAnswer: any = {};

      if (type === 'true_false') {
        payloadContent = {};
        payloadAnswer = { correct: tfAnswer };
      } else if (type === 'multiple_choice') {
        const normalizedOptions = mcOptions
          .map((value, index) => ({ index, value: value.trim() }))
          .filter((option) => option.value.length > 0);
        if (normalizedOptions.length < 2) {
          throw new Error(t('ws-quizzes.multiple_choice_min_options'));
        }
        const remappedIndex = normalizedOptions.findIndex(
          (option) => option.index === mcAnswer
        );

        payloadContent = {
          options: normalizedOptions.map((option) => option.value),
        };
        payloadAnswer = {
          correctIndex: remappedIndex >= 0 ? remappedIndex : 0,
        };
      } else if (type === 'matching') {
        const filteredPairs = matchingPairs.filter(
          (p) => p.left.trim() !== '' && p.right.trim() !== ''
        );
        payloadContent = { pairs: filteredPairs };
        payloadAnswer = { pairs: filteredPairs };
      } else if (type === 'ordering') {
        const filteredItems = orderingItems.filter((i) => i.trim() !== '');
        payloadContent = { items: filteredItems };
        payloadAnswer = { order: filteredItems };
      } else if (type === 'paragraph') {
        payloadContent = {};
        payloadAnswer = {};
      }

      if (data?.id) {
        // Edit Mode
        await updateWorkspaceQuiz(wsId, data.id, {
          question,
          type,
          content: payloadContent,
          answer: payloadAnswer,
        });
      } else {
        // Create Mode
        if (testId && courseId) {
          await createWorkspaceCourseTestQuestions(wsId, courseId, testId, {
            moduleId,
            quizzes: [
              {
                question,
                type,
                content: payloadContent,
                answer: payloadAnswer,
              },
            ],
          });
        } else {
          await createWorkspaceQuiz(wsId, {
            moduleId,
            quizzes: [
              {
                question,
                type,
                content: payloadContent,
                answer: payloadAnswer,
              },
            ],
          });
        }
      }
    },
    onSuccess: () => {
      toast.success(
        data?.id
          ? t('ws-quizzes.edit_description')
          : t('ws-quizzes.create_description')
      );
      queryClient.invalidateQueries({
        queryKey: ['module-quizzes', wsId, moduleId],
      });
      onFinish?.();
      router.refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : String(error));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) {
      toast.error(t('ws-quizzes.question_required'));
      return;
    }
    saveMutation.mutate();
  };

  // Multiple Choice Helpers
  const addMcOption = () => setMcOptions([...mcOptions, '']);
  const removeMcOption = (index: number) => {
    if (mcOptions.length <= 2) return;
    const newOptions = mcOptions.filter((_, i) => i !== index);
    setMcOptions(newOptions);
    if (mcAnswer >= newOptions.length) {
      setMcAnswer(newOptions.length - 1);
    }
  };
  const updateMcOption = (index: number, val: string) => {
    const newOptions = [...mcOptions];
    newOptions[index] = val;
    setMcOptions(newOptions);
  };

  // Matching Helpers
  const addMatchingPair = () =>
    setMatchingPairs([...matchingPairs, { left: '', right: '' }]);
  const removeMatchingPair = (index: number) => {
    if (matchingPairs.length <= 1) return;
    setMatchingPairs(matchingPairs.filter((_, i) => i !== index));
  };
  const updateMatchingPair = (
    index: number,
    field: 'left' | 'right',
    val: string
  ) => {
    const newPairs = [...matchingPairs];
    newPairs[index] = { ...newPairs[index]!, [field]: val };
    setMatchingPairs(newPairs);
  };

  // Ordering Helpers
  const addOrderingItem = () => setOrderingItems([...orderingItems, '']);
  const removeOrderingItem = (index: number) => {
    if (orderingItems.length <= 2) return;
    setOrderingItems(orderingItems.filter((_, i) => i !== index));
  };
  const updateOrderingItem = (index: number, val: string) => {
    const newItems = [...orderingItems];
    newItems[index] = val;
    setOrderingItems(newItems);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4">
        {/* Question Type Select */}
        <div className="space-y-2">
          <Label htmlFor="question-type">{t('ws-quizzes.question_type')}</Label>
          <Select
            value={type}
            onValueChange={(val: any) => setType(val)}
            disabled={!!data?.id}
          >
            <SelectTrigger id="question-type" className="w-full">
              <SelectValue placeholder={t('ws-quizzes.question_type')} />
            </SelectTrigger>
            <SelectContent>
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

        {/* Question Input */}
        <div className="space-y-2">
          <Label htmlFor="quiz-question">{t('ws-quizzes.question')}</Label>
          <Input
            id="quiz-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('ws-quizzes.question')}
            className="rounded-md border-foreground/20 shadow-sm"
            required
          />
        </div>
      </div>

      <Separator />

      {/* Conditionally Render Content Input based on Type */}
      <div className="space-y-4">
        {type === 'paragraph' && (
          <div className="space-y-3">
            <Label>{t('ws-quizzes.correct_answer')}</Label>
            <div className="border-2 border-border border-dashed bg-muted/20 p-4 text-center text-muted-foreground text-sm italic shadow-[2px_2px_0_var(--border)]">
              Paragraph Response Area (Students will type their answer here. No predefined correct answer is required.)
            </div>
          </div>
        )}

        {type === 'true_false' && (
          <div className="space-y-3">
            <Label>{t('ws-quizzes.correct_answer')}</Label>
            <RadioGroup
              value={tfAnswer ? 'true' : 'false'}
              onValueChange={(val) => setTfAnswer(val === 'true')}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="true" id="tf-true" />
                <Label htmlFor="tf-true" className="cursor-pointer">
                  {t('ws-quizzes.true')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="false" id="tf-false" />
                <Label htmlFor="tf-false" className="cursor-pointer">
                  {t('ws-quizzes.false')}
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {type === 'multiple_choice' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>{t('ws-quizzes.answer')}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addMcOption}
                className="flex items-center gap-1"
              >
                <Plus className="h-4 w-4" />
                {t('common.add_option')}
              </Button>
            </div>

            <div className="space-y-3">
              {mcOptions.map((option, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <RadioGroup
                    value={mcAnswer.toString()}
                    onValueChange={(val) => setMcAnswer(parseInt(val, 10))}
                    className="flex items-center"
                  >
                    <RadioGroupItem
                      value={idx.toString()}
                      id={`mc-radio-${idx}`}
                    />
                  </RadioGroup>

                  <Input
                    value={option}
                    onChange={(e) => updateMcOption(idx, e.target.value)}
                    placeholder={`${t('common.option')} ${idx + 1}`}
                    className="flex-1 rounded-md border-foreground/20 shadow-sm"
                    required
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMcOption(idx)}
                    disabled={mcOptions.length <= 2}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {type === 'matching' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>{t('ws-quizzes.matching_pairs')}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addMatchingPair}
                className="flex items-center gap-1"
              >
                <Plus className="h-4 w-4" />
                {t('ws-quizzes.add_pair')}
              </Button>
            </div>

            <div className="space-y-3">
              {matchingPairs.map((pair, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="grid flex-1 grid-cols-2 gap-2">
                    <Input
                      value={pair.left}
                      onChange={(e) =>
                        updateMatchingPair(idx, 'left', e.target.value)
                      }
                      placeholder={t('ws-quizzes.left_item')}
                      className="rounded-md border-foreground/20 shadow-sm"
                      required
                    />
                    <Input
                      value={pair.right}
                      onChange={(e) =>
                        updateMatchingPair(idx, 'right', e.target.value)
                      }
                      placeholder={t('ws-quizzes.right_item')}
                      className="rounded-md border-foreground/20 shadow-sm"
                      required
                    />
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMatchingPair(idx)}
                    disabled={matchingPairs.length <= 1}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {type === 'ordering' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>{t('ws-quizzes.ordering_items')}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addOrderingItem}
                className="flex items-center gap-1"
              >
                <Plus className="h-4 w-4" />
                {t('ws-quizzes.add_item')}
              </Button>
            </div>

            <div className="space-y-3">
              {orderingItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="w-6 font-semibold text-sm">{idx + 1}.</span>

                  <Input
                    value={item}
                    onChange={(e) => updateOrderingItem(idx, e.target.value)}
                    placeholder={`${t('ws-quizzes.order')} ${idx + 1}`}
                    className="flex-1 rounded-md border-foreground/20 shadow-sm"
                    required
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeOrderingItem(idx)}
                    disabled={orderingItems.length <= 2}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Buttons */}
      <div className="flex justify-end gap-3">
        {onFinish && (
          <Button type="button" variant="ghost" onClick={onFinish}>
            {t('common.cancel')}
          </Button>
        )}
        <Button
          type="submit"
          disabled={saveMutation.isPending}
          className="bg-dynamic-purple text-white hover:bg-dynamic-purple/95"
        >
          {saveMutation.isPending ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              {t('common.saving')}
            </>
          ) : data?.id ? (
            t('ws-quizzes.edit')
          ) : (
            t('ws-quizzes.create')
          )}
        </Button>
      </div>
    </form>
  );
}
