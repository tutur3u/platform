import { Button } from '@tuturuuu/ui/button';
import { AutosizeTextarea } from '@tuturuuu/ui/custom/autosize-textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import type { UseFormReturn } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { Separator } from '@tuturuuu/ui/separator';
import type * as z from 'zod';
import type { UserReportFormSchema } from './editable-report-preview';
import { useTranslations } from 'next-intl';

export default function UserReportForm({
  isNew,
  form,
  submitLabel,
  onSubmit,
  onDelete,
}: {
  isNew: boolean;
  form: UseFormReturn<z.infer<typeof UserReportFormSchema>>;
  submitLabel: string;
  // eslint-disable-next-line no-unused-vars
  onSubmit?: (formData: z.infer<typeof UserReportFormSchema>) => void;
  onDelete?: () => void;
}) {
  const t = useTranslations();
  return (
    <div className="grid h-fit gap-2 rounded-lg border p-4">
      <div className="font-semibold text-lg">{t('ws-settings.basic_info')}</div>
      <Separator />
      <Form {...form}>
        <form
          onSubmit={onSubmit && form.handleSubmit(onSubmit)}
          className="grid gap-2"
        >
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('user-report-data-table.title')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('user-report-data-table.title')}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('user-report-data-table.content')}</FormLabel>
                <FormControl>
                  <AutosizeTextarea
                    placeholder={t('user-report-data-table.content')}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="feedback"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('user-report-data-table.feedback')}</FormLabel>
                <FormControl>
                  <AutosizeTextarea
                    placeholder={t('user-report-data-table.feedback')}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator />

          <div className="flex gap-2">
            <Button type="submit" className="w-full">
              {submitLabel}
            </Button>
            {!isNew && onDelete && (
              <Button type="button" variant="destructive" onClick={onDelete}>
                {t('common.delete')}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}
