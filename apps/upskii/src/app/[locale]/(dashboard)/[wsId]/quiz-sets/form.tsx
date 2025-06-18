'use client';

import { type WorkspaceQuizSet } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Switch } from '@tuturuuu/ui/switch';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { Textarea } from '@tuturuuu/ui/textarea';
import { JSONContent } from '@tuturuuu/ui/tiptap';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as z from 'zod';

interface Props {
  wsId: string;
  moduleId?: string;
  data?: WorkspaceQuizSet;
  // eslint-disable-next-line no-unused-vars
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: 'Name is required' }),
  moduleId: z.string().optional(),
  attemptLimit: z.number().int().min(0).optional(),
  timeLimitMinutes: z.number().int().min(0).optional(),
  allowViewResults: z.boolean().default(true),
  releasePointsImmediately: z.boolean().default(true),
  availableDate: z.string().optional(),
  dueDate: z.string().optional(),
  explanationMode: z
    .union([z.literal(0), z.literal(1), z.literal(2)])
    .default(0),
});

export default function CourseModuleForm({
  wsId,
  moduleId,
  data,
  onFinish,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [instruction, setInstruction] = useState<JSONContent>({
    type: 'doc',
    content: [],
  });

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id,
      name: data?.name || '',
      moduleId,
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting || !instruction;

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    try {
      const res = await fetch(
        data.id
          ? `/api/v1/workspaces/${wsId}/quiz-sets/${data.id}`
          : `/api/v1/workspaces/${wsId}/quiz-sets`,
        {
          method: data.id ? 'PUT' : 'POST',
          body: JSON.stringify(data),
        }
      );

      if (res.ok) {
        onFinish?.(data);
        router.refresh();
      } else {
        const data = await res.json();
        toast({
          title: `Failed to ${data.id ? 'edit' : 'create'} course module`,
          description: data.message,
        });
      }
    } catch (error) {
      toast({
        title: `Failed to ${data.id ? 'edit' : 'create'} course module`,
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid max-h-[50vh] grid-cols-1 gap-3 overflow-scroll"
      >
        {/* Name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('ws-quiz-sets.name')}</FormLabel>
              <FormControl>
                <Input placeholder={t('ws-quiz-sets.name')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Attempt Limit */}
        <FormField
          control={form.control}
          name="attemptLimit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('ws-quiz-sets.attempt_limit')}</FormLabel>
              <FormControl>
                <Input type="number" placeholder="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Time Limit Minutes */}
        <FormField
          control={form.control}
          name="timeLimitMinutes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('ws-quiz-sets.time_limit_minutes')}</FormLabel>
              <FormControl>
                <Input type="number" placeholder="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Available Date */}
        <FormField
          control={form.control}
          name="availableDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('ws-quiz-sets.available_date')}</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Due Date */}
        <FormField
          control={form.control}
          name="dueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('ws-quiz-sets.due_date')}</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Booleans */}
        <FormField
          control={form.control}
          name="allowViewResults"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between">
              <FormLabel>{t('ws-quiz-sets.allow_view_results')}</FormLabel>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="releasePointsImmediately"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between">
              <FormLabel>
                {t('ws-quiz-sets.release_points_immediately')}
              </FormLabel>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        {/* Explanation Mode */}
        <FormField
          control={form.control}
          name="explanationMode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('ws-quiz-sets.explanation_mode')}</FormLabel>
              <FormControl>
                <select {...field} className="block w-full rounded border p-2">
                  {/* use native select or custom*/}
                  <option value={0}>
                    {t('ws-quiz-sets.explanation_none')}
                  </option>
                  <option value={1}>
                    {t('ws-quiz-sets.explanation_during')}
                  </option>
                  <option value={2}>
                    {t('ws-quiz-sets.explanation_after')}
                  </option>
                </select>
              </FormControl>
            </FormItem>
          )}
        />

        {/* Instruction JSON */}
        {/* <FormField
          control={form.control}
          name="instruction"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('ws-quiz-sets.instruction')}</FormLabel>
              <FormControl>
                <Textarea placeholder="{}" rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        /> */}
        {/* <div className="mx-auto w-full pt-2 text-slate-900 dark:text-slate-100">
          <InstructionEditor
            quizSetId={data?.id || ''}
            instruction={instruction}
            setInstruction={setInstruction}
          />
        </div> */}

        <Button type="submit" className="w-full" disabled={disabled}>
          {data?.id ? t('ws-quiz-sets.edit') : t('ws-quiz-sets.create')}
        </Button>
      </form>
    </Form>
  );
}

interface InstructionEditorProps {
  quizSetId: string;
  instruction: JSONContent;
  setInstruction: (instruction: JSONContent) => void;
}

function InstructionEditor({
  quizSetId,
  instruction,
  setInstruction,
}: InstructionEditorProps) {
  const t = useTranslations();

  const [saving, setSaving] = useState(false);

  const INSTRUCTION_EDITOR_KEY = `instrction-quiz-set-${quizSetId}`;

  const handleSave = async () => {
    setSaving(true);
    localStorage.setItem(INSTRUCTION_EDITOR_KEY, JSON.stringify(instruction));
    setSaving(false);
  };

  return (
    <div className="mx-auto w-full pt-4">
      <h3 className="mb-2 text-lg font-semibold">
        {t('quiz.edit_instruction') || 'Edit Quiz Instruction'}
      </h3>

      <RichTextEditor
        content={instruction}
        onChange={setInstruction}
        titlePlaceholder={
          t('quiz.instruction_heading_placeholder') || 'Heading...'
        }
        writePlaceholder={
          t('quiz.instruction_body_placeholder') || 'Write instructions here...'
        }
        // We disable the built-in save button, since we’re using ours:
        saveButtonLabel={t('common.save')}
        savedButtonLabel={t('common.saved')}
      />

      <div className="mt-4">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-dynamic-purple text-white hover:bg-dynamic-purple/80"
        >
          {saving
            ? t('common.saving') || 'Saving...'
            : t('quiz.save_instruction') || 'Save Instruction'}
        </Button>
      </div>
    </div>
  );
}
