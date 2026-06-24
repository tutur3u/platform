'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import type {
  RenderEmailTemplateRequest,
  RenderEmailTemplateResponse,
} from './render-template';
import { EMAIL_TEMPLATES } from './template-definitions';
import {
  getInitialFormValues,
  parseTemplateProps,
} from './template-form-utils';
import { TemplateLivePreviewPanel } from './template-live-preview-panel';
import { TemplatePropertiesPanel } from './template-properties-panel';

type EmailTemplatePreviewProps = {
  renderTemplate: (
    input: RenderEmailTemplateRequest
  ) => Promise<RenderEmailTemplateResponse>;
};

export function EmailTemplatePreview({
  renderTemplate,
}: EmailTemplatePreviewProps) {
  const t = useTranslations('email-templates');
  const { resolvedTheme } = useTheme();
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    EMAIL_TEMPLATES[0]?.id ?? ''
  );
  const [formValues, setFormValues] = useState<Record<string, unknown>>(() =>
    EMAIL_TEMPLATES[0] ? getInitialFormValues(EMAIL_TEMPLATES[0]) : {}
  );
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [hasUserSelectedTheme, setHasUserSelectedTheme] = useState(false);

  useEffect(() => {
    if (!(hasUserSelectedTheme || !resolvedTheme)) {
      setIsDarkMode(resolvedTheme === 'dark');
    }
  }, [hasUserSelectedTheme, resolvedTheme]);

  const selectedTemplate = useMemo(
    () =>
      EMAIL_TEMPLATES.find((template) => template.id === selectedTemplateId),
    [selectedTemplateId]
  );

  const parsedProps = useMemo(
    () => parseTemplateProps(formValues, selectedTemplate),
    [formValues, selectedTemplate]
  );

  const previewQuery = useQuery({
    enabled: Boolean(selectedTemplate),
    placeholderData: keepPreviousData,
    queryFn: () =>
      renderTemplate({
        props: parsedProps,
        templateId: selectedTemplateId,
      }),
    queryKey: [
      'infrastructure',
      'email-templates',
      'preview',
      selectedTemplateId,
      parsedProps,
    ],
    retry: false,
    staleTime: 30_000,
  });

  const handleTemplateChange = useCallback((templateId: string) => {
    const template = EMAIL_TEMPLATES.find((item) => item.id === templateId);

    setSelectedTemplateId(templateId);
    setFormValues(template ? getInitialFormValues(template) : {});
  }, []);

  const handleFieldChange = useCallback(
    (fieldName: string, value: boolean | number | string) => {
      setFormValues((prev) => ({ ...prev, [fieldName]: value }));
    },
    []
  );

  const handleCopyHtml = useCallback(async () => {
    const html = previewQuery.data?.html;

    if (!html) {
      return;
    }

    try {
      await navigator.clipboard.writeText(html);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copy_failed'));
    }
  }, [previewQuery.data?.html, t]);

  const handleToggleTheme = useCallback(() => {
    setHasUserSelectedTheme(true);
    setIsDarkMode((value) => !value);
  }, []);

  if (!selectedTemplate) {
    return (
      <div className="text-center text-muted-foreground">
        {t('no_templates')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Label className="font-medium" htmlFor="template-select">
          {t('select_template')}
        </Label>
        <Select onValueChange={handleTemplateChange} value={selectedTemplateId}>
          <SelectTrigger className="w-full sm:w-75" id="template-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EMAIL_TEMPLATES.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <TemplatePropertiesPanel
          formValues={formValues}
          onFieldChange={handleFieldChange}
          template={selectedTemplate}
        />
        <TemplateLivePreviewPanel
          html={previewQuery.data?.html ?? ''}
          isDarkMode={isDarkMode}
          isError={previewQuery.isError}
          onCopyHtml={handleCopyHtml}
          onToggleTheme={handleToggleTheme}
        />
      </div>
    </div>
  );
}
