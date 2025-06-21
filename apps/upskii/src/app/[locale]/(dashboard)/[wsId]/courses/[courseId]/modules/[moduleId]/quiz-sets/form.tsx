'use client';

import InstructionEditor from './instruction-editor';
import type { WorkspaceQuizSet } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import {
  Calendar,
  Clock,
  Eye,
  FileText,
  RotateCcw,
  Settings,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as z from 'zod';

interface Props {
  wsId: string;
  moduleId: string;
  data?: WorkspaceQuizSet;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().nonempty(),
  moduleId: z.string(),
  attemptLimit: z.number().nullable(),
  timeLimitMinutes: z.number().nullable(),
  allowViewResults: z.boolean(),
  dueDate: z.string(),
  availableDate: z.string(),
  explanationMode: z.number().int(),
  instruction: z.any().optional(), // Changed to z.any() to handle JSONContent
  resultsReleased: z.boolean(),
  allowViewOldAttempts: z.boolean(),
});

export default function QuizSetForm({ wsId, moduleId, data, onFinish }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id,
      name: data?.name ?? '',
      moduleId,
      attemptLimit: data?.attempt_limit ?? null,
      timeLimitMinutes: data?.time_limit_minutes ?? null,
      allowViewResults: data?.allow_view_results ?? true,
      availableDate: data?.available_date
        ? data.available_date.toString().slice(0, 16)
        : '',
      dueDate: data?.due_date ? data.due_date.toString().slice(0, 16) : '',
      explanationMode: data?.explanation_mode ?? 0,
      instruction: data?.instruction ?? null, // Changed to handle JSONContent directly
      resultsReleased: data?.results_released ?? false,
      allowViewOldAttempts: data?.allow_view_old_attempts ?? true,
    },
  });

  const { isDirty, isValid, isSubmitting } = form.formState;
  const disabled = !isDirty || !isValid || isSubmitting;

  const onSubmit = async (values: z.infer<typeof FormSchema>) => {
    try {
      const { timeLimitMinutes, attemptLimit, instruction } = values;
      const payload = {
        name: values.name.trim(),
        moduleId: moduleId,
        allow_view_results: values.allowViewResults,
        due_date: values.dueDate,
        available_date: values.availableDate,
        explanation_mode: values.explanationMode,
        results_released: values.resultsReleased,
        allow_view_old_attempts: values.allowViewOldAttempts,

        time_limit_minutes: timeLimitMinutes
          ? timeLimitMinutes <= 0
            ? null
            : timeLimitMinutes
          : null,
        attempt_limit: attemptLimit
          ? attemptLimit <= 0
            ? null
            : attemptLimit
          : null,
        instruction: instruction, // No need to JSON.parse since it's already JSONContent
      };
      // console.log('Payload', payload, values.timeLimitMinutes != null && values.timeLimitMinutes <=0, "hello");
      const res = await fetch(
        values.id
          ? `/api/v1/workspaces/${wsId}/quiz-sets/${values.id}`
          : `/api/v1/workspaces/${wsId}/quiz-sets`,
        {
          method: values.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (res.ok) {
        onFinish?.(values);
        router.refresh();
      } else {
        const err = await res.json();
        toast({ title: t('error_saving'), description: err.message });
      }
    } catch (error) {
      toast({
        title: t('error_saving'),
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 bg-gradient-to-r from-dynamic-purple to-dynamic-red bg-clip-text text-3xl font-bold text-transparent">
            {data?.id ? t('ws-quiz-sets.edit') : t('ws-quiz-sets.create')}
          </h1>
          <p className="mx-auto max-w-2xl text-muted-foreground italic">
            {t('ws-quiz-sets.form-description')}
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Hidden moduleId */}
            <input
              type="hidden"
              value={moduleId}
              {...form.register('moduleId')}
            />

            {/* Basic Information Card */}
            <Card className="border-dynamic-purple/50 shadow-lg">
              <CardHeader className="rounded-t-lg bg-gradient-to-r from-dynamic-purple/20 to-dynamic-light-purple/40 text-secondary-foreground">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {t('ws-quiz-sets.form-sections.basic.title')}
                </CardTitle>
                <CardDescription className="text-dynamic-light-purple">
                  {t('ws-quiz-sets.form-sections.basic.subtitle')}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid gap-6">
                  {/* Name */}
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2 font-semibold text-dynamic-purple">
                          {t('ws-quiz-sets.form-fields.name.title')}
                          <Badge
                            variant="secondary"
                            className="bg-dynamic-light-purple/20 text-dynamic-purple"
                          >
                            {t('ws-quiz-sets.required-badge')}
                          </Badge>
                        </FormLabel>
                        <FormDescription className="text-muted-foreground">
                          {t('ws-quiz-sets.form-fields.name.description')}
                        </FormDescription>
                        <FormControl>
                          <Input
                            placeholder={t(
                              'ws-quiz-sets.form-fields.name.placeholder'
                            )}
                            {...field}
                            className="border-dynamic-purple/30 focus:border-dynamic-purple focus:ring-dynamic-purple/20"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Instruction */}
                  <FormField
                    control={form.control}
                    name="instruction"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold text-dynamic-purple">
                          {t('ws-quiz-sets.form-fields.instruction.title')}
                        </FormLabel>
                        <FormDescription className="text-muted-foreground">
                          {t(
                            'ws-quiz-sets.form-fields.instruction.description'
                          )}
                        </FormDescription>
                        <FormControl>
                          <InstructionEditor
                            quizSetId={data?.id || 'new'}
                            instruction={field.value || null}
                            setInstruction={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Timing & Limits Card */}
            <Card className="border-dynamic-purple/50 shadow-lg">
              <CardHeader className="rounded-t-lg bg-gradient-to-r from-dynamic-light-purple/20 to-dynamic-purple/40 text-secondary-foreground">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {t('ws-quiz-sets.form-sections.timing-limit.title')}
                </CardTitle>
                <CardDescription className="text-dynamic-light-purple">
                  {t('ws-quiz-sets.form-sections.timing-limit.subtitle')}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Attempt Limit */}
                  <FormField
                    control={form.control}
                    name="attemptLimit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold text-dynamic-purple">
                          {t('ws-quiz-sets.form-fields.attempt_limit.title')}
                        </FormLabel>
                        <FormDescription className="text-muted-foreground">
                          {t(
                            'ws-quiz-sets.form-fields.attempt_limit.description'
                          )}
                        </FormDescription>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === ''
                                  ? null
                                  : Number(e.target.value)
                              )
                            }
                            placeholder={t(
                              'ws-quiz-sets.form-fields.attempt_limit.placeholder'
                            )}
                            className="border-dynamic-purple/30 focus:border-dynamic-purple focus:ring-dynamic-purple/20"
                          />
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
                        <FormLabel className="font-semibold text-dynamic-purple">
                          {t(
                            'ws-quiz-sets.form-fields.time_limit_minutes.title'
                          )}
                        </FormLabel>
                        <FormDescription className="text-muted-foreground">
                          {t(
                            'ws-quiz-sets.form-fields.time_limit_minutes.description'
                          )}
                        </FormDescription>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            {...field}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === ''
                                  ? null
                                  : Number(e.target.value)
                              )
                            }
                            value={field.value ?? ''}
                            placeholder={t(
                              'ws-quiz-sets.form-fields.time_limit_minutes.placeholder'
                            )}
                            className="border-dynamic-purple/30 focus:border-dynamic-purple focus:ring-dynamic-purple/20"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Schedule Card */}
            <Card className="border-dynamic-purple/50 shadow-lg">
              <CardHeader className="rounded-t-lg bg-gradient-to-r from-dynamic-light-purple/20 to-dynamic-purple/40 text-secondary-foreground">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {t('ws-quiz-sets.form-sections.schedule.title')}
                </CardTitle>
                <CardDescription className="text-dynamic-light-purple">
                  {t('ws-quiz-sets.form-sections.schedule.subtitle')}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Available Date */}
                  <FormField
                    control={form.control}
                    name="availableDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold text-dynamic-purple">
                          {t('ws-quiz-sets.form-fields.available_date.title')}
                        </FormLabel>
                        <FormDescription className="text-muted-foreground">
                          {t(
                            'ws-quiz-sets.form-fields.available_date.description'
                          )}
                        </FormDescription>
                        <FormControl>
                          <Input
                            type="datetime-local"
                            {...field}
                            className="border-dynamic-purple/30 focus:border-dynamic-purple focus:ring-dynamic-purple/20"
                          />
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
                        <FormLabel className="font-semibold text-dynamic-purple">
                          {t('ws-quiz-sets.form-fields.due_date.title')}
                        </FormLabel>
                        <FormDescription className="text-muted-foreground">
                          {t('ws-quiz-sets.form-fields.due_date.description')}
                        </FormDescription>
                        <FormControl>
                          <Input
                            type="datetime-local"
                            {...field}
                            className="border-dynamic-purple/30 focus:border-dynamic-purple focus:ring-dynamic-purple/20"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Settings Card */}
            <Card className="border-dynamic-purple/50 shadow-lg">
              <CardHeader className="rounded-t-lg bg-gradient-to-r from-dynamic-light-purple/20 to-dynamic-purple/40 text-secondary-foreground">
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  {t('ws-quiz-sets.form-sections.settings.title')}
                </CardTitle>
                <CardDescription className="text-dynamic-light-purple">
                  {t('ws-quiz-sets.form-sections.settings.subtitle')}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid gap-6">
                  {/* Explanation Mode */}
                  <FormField
                    control={form.control}
                    name="explanationMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold text-dynamic-purple">
                          {t('ws-quiz-sets.form-fields.explanation_mode.title')}
                        </FormLabel>
                        <FormDescription className="text-muted-foreground">
                          {t(
                            'ws-quiz-sets.form-fields.explanation_mode.description'
                          )}
                        </FormDescription>
                        <Select
                          onValueChange={(value) =>
                            field.onChange(Number.parseInt(value))
                          }
                          value={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger className="border-dynamic-purple/30 focus:border-dynamic-purple focus:ring-dynamic-purple/20">
                              <SelectValue
                                placeholder={t(
                                  'ws-quiz-sets.form-fields.explanation_mode.placeholder'
                                )}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="0">
                              {t(
                                'ws-quiz-sets.form-fields.explanation_mode.select_never'
                              )}
                            </SelectItem>
                            <SelectItem value="1">
                              {t(
                                'ws-quiz-sets.form-fields.explanation_mode.select_correct_answer'
                              )}
                            </SelectItem>
                            <SelectItem value="2">
                              {t(
                                'ws-quiz-sets.form-fields.explanation_mode.select_all_answer'
                              )}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Permission Checkboxes */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="allowViewResults"
                      render={({ field }) => (
                        <FormItem className="flex flex-col space-y-3 rounded-lg border border-dynamic-purple/20 bg-dynamic-light-purple/5 p-4">
                          <label>
                            <div className="flex items-center space-x-3">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  className="border-dynamic-purple data-[state=checked]:border-dynamic-purple data-[state=checked]:bg-dynamic-purple"
                                />
                              </FormControl>
                              <Eye className="h-4 w-4 text-dynamic-purple" />
                            </div>
                            <div>
                              <FormLabel className="font-semibold text-dynamic-purple">
                                {t(
                                  'ws-quiz-sets.form-fields.allow_view_results.title'
                                )}
                              </FormLabel>
                              <FormDescription className="text-sm text-muted-foreground">
                                {t(
                                  'ws-quiz-sets.form-fields.allow_view_results.description'
                                )}
                              </FormDescription>
                            </div>
                          </label>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="resultsReleased"
                      render={({ field }) => (
                        <FormItem className="flex flex-col space-y-3 rounded-lg border border-dynamic-purple/20 bg-dynamic-light-purple/5 p-4">
                          <label>
                            <div className="flex items-center space-x-3">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  className="border-dynamic-purple data-[state=checked]:border-dynamic-purple data-[state=checked]:bg-dynamic-purple"
                                />
                              </FormControl>
                              <FileText className="h-4 w-4 text-dynamic-purple" />
                            </div>
                            <div>
                              <FormLabel className="font-semibold text-dynamic-purple">
                                {t(
                                  'ws-quiz-sets.form-fields.results_released.title'
                                )}
                              </FormLabel>
                              <FormDescription className="text-sm text-muted-foreground">
                                {t(
                                  'ws-quiz-sets.form-fields.results_released.description'
                                )}
                              </FormDescription>
                            </div>
                          </label>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="allowViewOldAttempts"
                      render={({ field }) => (
                        <FormItem className="flex flex-col space-y-3 rounded-lg border border-dynamic-purple/20 bg-dynamic-light-purple/5 p-4 md:col-span-2">
                          <label>
                            <div className="flex items-center space-x-3">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  className="border-dynamic-purple data-[state=checked]:border-dynamic-purple data-[state=checked]:bg-dynamic-purple"
                                />
                              </FormControl>
                              <RotateCcw className="h-4 w-4 text-dynamic-purple" />
                            </div>
                            <div>
                              <FormLabel className="font-semibold text-dynamic-purple">
                                {t(
                                  'ws-quiz-sets.form-fields.allow_view_old_attempts.title'
                                )}
                              </FormLabel>
                              <FormDescription className="text-sm text-muted-foreground">
                                {t(
                                  'ws-quiz-sets.form-fields.allow_view_old_attempts.description'
                                )}
                              </FormDescription>
                            </div>
                          </label>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Submit Button */}
            <div className="flex justify-center pt-3 pb-16">
              <Button
                type="submit"
                className="w-full border border-dynamic-purple bg-dynamic-purple/30 px-12 py-5 text-lg font-semibold text-primary shadow-lg transition-all duration-200 hover:bg-dynamic-purple/70 hover:text-secondary-foreground hover:shadow-xl md:w-auto"
                disabled={disabled}
              >
                {isSubmitting ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                    {data?.id
                      ? t('ws-quiz-sets.editing')
                      : t('ws-quiz-sets.creating')}
                  </>
                ) : data?.id ? (
                  t('ws-quiz-sets.edit')
                ) : (
                  t('ws-quiz-sets.create')
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
