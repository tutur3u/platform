'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import { SAFARI_SAFE_TURNSTILE_OPTIONS } from '@tuturuuu/cloudflare/turnstile/client';
import { CheckCircle } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  SettingsSection,
  SettingsSectionBlock,
  SettingsSectionFooter,
} from './custom/settings-section';
import { SettingsField } from './custom/settings-field';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import type { Product } from '@tuturuuu/types';
import { getFeedbackTypeLabel } from './feedback-labels';
import { FeedbackMediaField } from './feedback-media-field';
import {
  DEFAULT_PRODUCTS,
  DEFAULT_SUPPORT_TYPES,
  MAX_FILES,
  type ReportProblemDialogProps,
} from './report-problem-model';
import type { useReportProblem } from './use-report-problem';

type ReportState = ReturnType<typeof useReportProblem>;

interface FeedbackFormProps {
  report: ReportState;
  t: ReportProblemDialogProps['t'];
  products?: Array<{ value: Product; label: string }>;
  ImageComponent?: ReportProblemDialogProps['ImageComponent'];
  onCancel: () => void;
}

export function FeedbackForm({
  report,
  t,
  products = DEFAULT_PRODUCTS,
  ImageComponent,
  onCancel,
}: FeedbackFormProps) {
  const {
    formData,
    validationErrors,
    isSubmitting,
    suggestionId,
    handleSubmit,
    handleProductChange,
    handleTypeChange,
    handleSuggestionChange,
    turnstile,
    unavailable,
  } = report;
  const invalid = (message?: string) =>
    message
      ? ({ kind: 'invalid', message } as const)
      : ({ kind: 'valid' } as const);

  return (
    <SettingsSection surface="card">
      <form onSubmit={handleSubmit} noValidate>
        <SettingsField
          label={t('affected-product-required')}
          controlWidth="md"
          validation={invalid(validationErrors.product)}
        >
          {(control) => (
            <Select
              value={formData.product}
              onValueChange={handleProductChange}
            >
              <SelectTrigger {...control}>
                <SelectValue placeholder={t('select-product-placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.value} value={product.value}>
                    {product.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </SettingsField>

        <SettingsField
          label={t('feedback-dialog-support-type')}
          controlWidth="md"
          validation={invalid(validationErrors.type)}
        >
          {(control) => (
            <Select value={formData.type} onValueChange={handleTypeChange}>
              <SelectTrigger {...control}>
                <SelectValue
                  placeholder={t('feedback-dialog-support-type-placeholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_SUPPORT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {getFeedbackTypeLabel(t, type.value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </SettingsField>

        <SettingsField
          id={suggestionId}
          label={t('suggestion-improve')}
          layout="stacked"
          description={t('feedback-dialog-characters', {
            count: formData.suggestion.length,
            max: 1000,
          })}
          validation={invalid(validationErrors.suggestion)}
        >
          {(control) => (
            <Textarea
              {...control}
              placeholder={t('suggestion-placeholder')}
              value={formData.suggestion}
              onChange={handleSuggestionChange}
              className="max-h-62.5 min-h-30 resize-y"
            />
          )}
        </SettingsField>

        <SettingsSectionBlock className="space-y-3">
          <Label htmlFor={report.mediaUploadId} className="font-medium text-sm">
            {t('media-optional')} ({formData.media.length}/{MAX_FILES})
          </Label>
          <FeedbackMediaField
            report={report}
            t={t}
            ImageComponent={ImageComponent}
          />
        </SettingsSectionBlock>

        <SettingsSectionBlock className="space-y-2">
          {turnstile.canRender && turnstile.siteKey ? (
            <Turnstile
              ref={turnstile.widgetRef}
              siteKey={turnstile.siteKey}
              options={SAFARI_SAFE_TURNSTILE_OPTIONS}
              onSuccess={turnstile.onSuccess}
              onExpire={turnstile.onExpire}
              onTimeout={turnstile.onExpire}
              onError={turnstile.onError}
            />
          ) : (
            <p className="text-dynamic-red text-sm" role="alert">
              {t('feedback-dialog-captcha-unavailable')}
            </p>
          )}
          {turnstile.failed && (
            <p className="text-dynamic-red text-sm" role="alert">
              {t('feedback-dialog-captcha-failed')}
            </p>
          )}
        </SettingsSectionBlock>

        {unavailable && (
          <p
            className="rounded-md border border-dynamic-orange/30 bg-dynamic-orange/10 px-3 py-2 text-dynamic-orange text-sm"
            role="alert"
          >
            {unavailable === 'media'
              ? t('feedback-dialog-media-unavailable')
              : t('feedback-dialog-unavailable')}
          </p>
        )}

        <SettingsSectionFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            disabled={
              !formData.product ||
              !formData.type ||
              !formData.suggestion.trim() ||
              !turnstile.token ||
              unavailable === 'all' ||
              isSubmitting
            }
          >
            <CheckCircle className="size-4" />
            {isSubmitting ? t('submitting') : t('submit-report')}
          </Button>
        </SettingsSectionFooter>
      </form>
    </SettingsSection>
  );
}
