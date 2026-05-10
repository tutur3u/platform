import { Loader2, Lock } from '@tuturuuu/icons';
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
import {
  MAX_MONTHLY_REPORT_TEXT_LENGTH,
  MAX_MONTHLY_REPORT_TITLE_LENGTH,
} from '@/features/reports/report-limits';
import { CharacterCount } from './character-count';
import type { UserReportFormProps } from './form-types';

export default function UserReportForm({
  isNew,
  form,
  submitLabel,
  onSubmit,
  onDelete,
  managerOptions,
  selectedManagerName,
  onChangeManager,
  canSubmit = true,
  canDelete = false,
  isSubmitting = false,
  showHeading = true,
  readOnlyMessage,
}: UserReportFormProps) {
  const t = useTranslations();
  const fieldsDisabled = isSubmitting;

  return (
    <div className="grid h-fit gap-2 rounded-lg border p-4">
      {showHeading ? (
        <>
          <div className="font-semibold text-lg">
            {t('ws-settings.basic_info')}
          </div>
          <Separator />
        </>
      ) : null}
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
                  disabled={fieldsDisabled}
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
                    disabled={fieldsDisabled}
                    maxLength={MAX_MONTHLY_REPORT_TITLE_LENGTH}
                    placeholder={t('user-report-data-table.title')}
                    {...field}
                  />
                </FormControl>
                <CharacterCount
                  maxLength={MAX_MONTHLY_REPORT_TITLE_LENGTH}
                  value={field.value}
                />
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
                    disabled={fieldsDisabled}
                    maxLength={MAX_MONTHLY_REPORT_TEXT_LENGTH}
                    placeholder={t('user-report-data-table.content')}
                    {...field}
                  />
                </FormControl>
                <CharacterCount
                  maxLength={MAX_MONTHLY_REPORT_TEXT_LENGTH}
                  value={field.value}
                />
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
                    disabled={fieldsDisabled}
                    maxLength={MAX_MONTHLY_REPORT_TEXT_LENGTH}
                    placeholder={t('user-report-data-table.feedback')}
                    {...field}
                  />
                </FormControl>
                <CharacterCount
                  maxLength={MAX_MONTHLY_REPORT_TEXT_LENGTH}
                  value={field.value}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator />

          {!canSubmit && readOnlyMessage ? (
            <div className="flex items-start gap-2 rounded-lg border border-dynamic-yellow/30 bg-dynamic-yellow/10 px-3 py-2 text-dynamic-yellow text-sm">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{readOnlyMessage}</span>
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button
              type="submit"
              className="w-full"
              disabled={!form.formState.isDirty || !canSubmit || isSubmitting}
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
