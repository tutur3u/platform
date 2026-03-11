'use client';

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
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import * as z from 'zod';
import {
  getWhiteboardDescriptionValidationError,
  getWhiteboardTitleValidationError,
  WHITEBOARD_DESCRIPTION_MAX_LENGTH,
  WHITEBOARD_TITLE_MAX_LENGTH,
} from './validation';

export type WhiteboardFormValues = {
  description: string;
  title: string;
};

interface WhiteboardFormProps {
  defaultValues?: WhiteboardFormValues;
  whiteboardId?: string;

  onSubmit: (values: WhiteboardFormValues) => void;
  isSubmitting: boolean;
}

export default function WhiteboardForm({
  defaultValues,
  whiteboardId,
  onSubmit,
  isSubmitting,
}: WhiteboardFormProps) {
  const t = useTranslations('common');
  const isEditing = !!whiteboardId;
  const formSchema = z.object({
    title: z.string().superRefine((value, ctx) => {
      const errorKey = getWhiteboardTitleValidationError(value);
      if (errorKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t(errorKey),
        });
      }
    }),
    description: z.string().superRefine((value, ctx) => {
      const errorKey = getWhiteboardDescriptionValidationError(value);
      if (errorKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t(errorKey),
        });
      }
    }),
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      ...defaultValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('whiteboard_title')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('whiteboard_title_placeholder')}
                  autoFocus
                  maxLength={WHITEBOARD_TITLE_MAX_LENGTH}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('whiteboard_description')}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t('whiteboard_description_placeholder')}
                  className="min-h-20 resize-none"
                  maxLength={WHITEBOARD_DESCRIPTION_MAX_LENGTH}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? isEditing
                ? t('updating')
                : t('creating')
              : isEditing
                ? t('update_action')
                : t('create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
