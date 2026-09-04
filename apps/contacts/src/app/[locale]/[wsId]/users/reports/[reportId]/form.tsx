import { CheckCircle2, Loader2, Lock } from '@tuturuuu/icons';
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
import {
  MAX_MONTHLY_REPORT_TEXT_LENGTH,
  MAX_MONTHLY_REPORT_TITLE_LENGTH,
} from '@tuturuuu/users-core/features/reports/report-limits';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { KeyboardEvent } from 'react';
import { CharacterCount } from './character-count';
import type { UserReportFormProps } from './form-types';

const stopEditableShortcutPropagation = (
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
) => {
  event.stopPropagation();
};

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
  const hasUnsavedChanges = form.formState.isDirty;
  const canSubmitForm = isNew || hasUnsavedChanges;

  return (
    <div
      className={cn(
        'grid h-fit gap-3',
        isNew ? 'p-1' : 'rounded-lg border p-4'
      )}
    >
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
            if (!isNew && !form.formState.isDirty) {
              e.preventDefault();
              return;
            }
            if (onSubmit) {
              return form.handleSubmit(onSubmit)(e);
            }
          }}
          className="grid gap-3"
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
                    {...field}
                    disabled={fieldsDisabled}
                    maxLength={MAX_MONTHLY_REPORT_TITLE_LENGTH}
                    onKeyDownCapture={stopEditableShortcutPropagation}
                    placeholder={t('user-report-data-table.title')}
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
                    {...field}
                    disabled={fieldsDisabled}
                    maxLength={MAX_MONTHLY_REPORT_TEXT_LENGTH}
                    onKeyDownCapture={stopEditableShortcutPropagation}
                    placeholder={t('user-report-data-table.content')}
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
                    {...field}
                    disabled={fieldsDisabled}
                    maxLength={MAX_MONTHLY_REPORT_TEXT_LENGTH}
                    onKeyDownCapture={stopEditableShortcutPropagation}
                    placeholder={t('user-report-data-table.feedback')}
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

          {!canSubmit && readOnlyMessage ? (
            <div className="flex items-start gap-2 rounded-lg border border-dynamic-yellow/30 bg-dynamic-yellow/10 px-3 py-2 text-dynamic-yellow text-sm">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{readOnlyMessage}</span>
            </div>
          ) : null}

          <div className="sticky bottom-0 z-10 -mx-1 mt-1 flex flex-col gap-2 border-t bg-background/95 px-1 pt-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-h-5 items-center gap-2 text-muted-foreground text-xs">
              {hasUnsavedChanges ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-dynamic-yellow" />
                  {t('ws-reports.unsaved_changes')}
                </>
              ) : isNew ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                  {t('ws-reports.ready_to_create')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                  {t('ws-reports.all_changes_saved')}
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                className="w-full min-w-36 sm:w-auto"
                disabled={!canSubmitForm || !canSubmit || isSubmitting}
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
          </div>
        </form>
      </Form>
    </div>
  );
}
