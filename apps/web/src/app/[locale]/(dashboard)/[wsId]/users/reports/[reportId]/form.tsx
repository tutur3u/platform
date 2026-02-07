import { Loader2 } from '@tuturuuu/icons';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import type * as z from 'zod';
import type { UserReportFormSchema } from './editable-report-preview';

export default function UserReportForm({
  isNew,
  form,
  submitLabel,
  onSubmit,
  onDelete,
  managerOptions,
  selectedManagerName,
  onChangeManager,
  canUpdate = true,
  canDelete = false,
  isSubmitting = false,
}: {
  isNew: boolean;
  form: UseFormReturn<z.infer<typeof UserReportFormSchema>>;
  submitLabel: string;

  onSubmit?: (formData: z.infer<typeof UserReportFormSchema>) => void;
  onDelete?: () => void;
  managerOptions?: Array<{ value: string; label: string }>;
  selectedManagerName?: string;
  onChangeManager?: (name?: string) => void;
  canUpdate?: boolean;
  canDelete?: boolean;
  isSubmitting?: boolean;
}) {
  const t = useTranslations();
  return (
    <div className="grid h-fit gap-2 rounded-lg border p-4">
      <div className="font-semibold text-lg">{t('ws-settings.basic_info')}</div>
      <Separator />
      <Form {...form}>
        <form
          onSubmit={(e) => {
            if (!form.formState.isDirty) {
              e.preventDefault();
              return;
            }
            if (onSubmit) {
              return form.handleSubmit(onSubmit)(e);
            }
          }}
          className="grid gap-2"
        >
          {managerOptions && managerOptions.length > 1 && (
            <FormItem>
              <FormLabel>{t('ws-reports.group_manager')}</FormLabel>
              <FormControl>
                <Select
                  value={selectedManagerName ?? ''}
                  onValueChange={(val) => onChangeManager?.(val || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('ws-reports.group_manager')} />
                  </SelectTrigger>
                  <SelectContent>
                    {managerOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}

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
            <Button
              type="submit"
              className="w-full"
              disabled={!form.formState.isDirty || !canUpdate || isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitLabel}
            </Button>
            {!isNew && onDelete && canDelete && (
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
