'use client';

import { render } from '@react-email/render';
import { Copy, Moon, Sun } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EMAIL_TEMPLATES, type PropField } from './templates';

export default function TemplatePreview() {
  const t = useTranslations('email-templates');
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    EMAIL_TEMPLATES[0]?.id || ''
  );
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [isDarkMode, setIsDarkMode] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Handle mounting and sync with system theme
  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync dark mode with resolved theme on mount
  useEffect(() => {
    if (mounted && resolvedTheme) {
      setIsDarkMode(resolvedTheme === 'dark');
    }
  }, [mounted, resolvedTheme]);

  const selectedTemplate = useMemo(
    () => EMAIL_TEMPLATES.find((t) => t.id === selectedTemplateId),
    [selectedTemplateId]
  );

  // Initialize form values when template changes
  useEffect(() => {
    if (selectedTemplate) {
      const initialValues: Record<string, unknown> = {};
      for (const field of selectedTemplate.propsSchema) {
        initialValues[field.name] =
          field.defaultValue ?? selectedTemplate.defaultProps[field.name] ?? '';
      }
      setFormValues(initialValues);
    }
  }, [selectedTemplate]);

  const handleFieldChange = useCallback(
    (fieldName: string, value: string | number | boolean) => {
      setFormValues((prev) => ({ ...prev, [fieldName]: value }));
    },
    []
  );

  // Parse JSON fields for rendering
  const parsedProps = useMemo(() => {
    if (!selectedTemplate) return {};

    const props: Record<string, unknown> = {};
    for (const field of selectedTemplate.propsSchema) {
      const value = formValues[field.name];
      if (field.type === 'textarea' && typeof value === 'string') {
        // Try to parse as JSON for textarea fields
        try {
          props[field.name] = JSON.parse(value);
        } catch {
          props[field.name] = value;
        }
      } else if (field.type === 'number' && typeof value === 'string') {
        props[field.name] = parseFloat(value) || 0;
      } else {
        props[field.name] = value;
      }
    }
    return props;
  }, [formValues, selectedTemplate]);

  // State to hold rendered HTML
  const [renderedHtml, setRenderedHtml] = useState('');

  // Render email HTML with retry mechanism for handling component suspension
  useEffect(() => {
    if (!selectedTemplate || !mounted) {
      return;
    }

    let retryCount = 0;
    const maxRetries = 5;
    let timeoutId: NodeJS.Timeout;

    const attemptRender = async () => {
      try {
        const Component = selectedTemplate.component;
        const markup = await render(<Component {...parsedProps} />);
        setRenderedHtml(markup);
      } catch (error) {
        console.error('Render attempt failed:', error);
        retryCount++;
        if (retryCount < maxRetries) {
          // Retry with exponential backoff
          timeoutId = setTimeout(attemptRender, 100 * retryCount);
        } else {
          // After all retries, show error only if no previous content
          setRenderedHtml(
            (prev) =>
              prev ||
              `<div style="padding: 20px; color: red;">Failed to render template after ${maxRetries} attempts</div>`
          );
        }
      }
    };

    // Initial delay to let components hydrate
    timeoutId = setTimeout(attemptRender, 50);

    return () => clearTimeout(timeoutId);
  }, [selectedTemplate, parsedProps, mounted]);

  // Update iframe content directly to prevent flashing
  // Initialize iframe and update content
  useEffect(() => {
    if (!iframeRef.current || !renderedHtml) return;

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument;
    if (!doc) return;

    // Only write content if it's strictly different or empty
    // We add a meta tag to prevent hydration mismatch
    const htmlContent = `<!DOCTYPE html>
<html class="${isDarkMode ? 'dark' : ''}">
  <head>
    <meta name="color-scheme" content="light dark">
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        padding: 16px;
        background-color: #ffffff;
        color: #000000;
        transition: background-color 0.3s ease, color 0.3s ease;
      }
      
      /* Dark mode simulation using CSS filter */
      html.dark {
        filter: invert(1) hue-rotate(180deg);
      }
      
      html.dark img, 
      html.dark video, 
      html.dark picture, 
      html.dark svg, 
      html.dark [style*="background-image"] {
        filter: invert(1) hue-rotate(180deg);
      }

      /* Custom scrollbar to look good in both modes */
      ::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }
      ::-webkit-scrollbar-track {
        background: transparent;
      }
      ::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 5px;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: #94a3b8;
      }
      
      /* Invert scrollbar in dark mode so it looks dark */
      html.dark ::-webkit-scrollbar-thumb {
        background: #475569;
      }
      html.dark ::-webkit-scrollbar-thumb:hover {
        background: #64748b;
      }
    </style>
  </head>
  <body>
    ${renderedHtml}
  </body>
</html>`;

    doc.open();
    doc.write(htmlContent);
    doc.close();
  }, [renderedHtml, isDarkMode]);

  // Handle dark mode toggle without reloading iframe
  useEffect(() => {
    if (!iframeRef.current) return;

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument;
    if (!doc || !doc.documentElement) return;

    if (isDarkMode) {
      doc.documentElement.classList.add('dark');
    } else {
      doc.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const handleCopyHtml = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(renderedHtml);
      toast.success(t('copied'));
    } catch {
      toast.error('Failed to copy HTML');
    }
  }, [renderedHtml, t]);

  const renderField = useCallback(
    (field: PropField) => {
      const value = formValues[field.name];

      switch (field.type) {
        case 'text':
          return (
            <Input
              id={field.name}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              placeholder={field.placeholder}
            />
          );

        case 'textarea':
          return (
            <Textarea
              id={field.name}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              rows={6}
              className="font-mono text-sm"
            />
          );

        case 'number':
          return (
            <Input
              id={field.name}
              type="number"
              value={typeof value === 'number' ? value : ''}
              onChange={(e) =>
                handleFieldChange(field.name, parseFloat(e.target.value) || 0)
              }
              placeholder={field.placeholder}
            />
          );

        case 'select':
          return (
            <Select
              value={typeof value === 'string' ? value : ''}
              onValueChange={(val) => handleFieldChange(field.name, val)}
            >
              <SelectTrigger>
                <SelectValue placeholder={field.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );

        case 'boolean':
          return (
            <Select
              value={value === true ? 'true' : 'false'}
              onValueChange={(val) =>
                handleFieldChange(field.name, val === 'true')
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">True</SelectItem>
                <SelectItem value="false">False</SelectItem>
              </SelectContent>
            </Select>
          );

        default:
          return null;
      }
    },
    [formValues, handleFieldChange]
  );

  if (!selectedTemplate) {
    return (
      <div className="text-center text-muted-foreground">
        {t('no_templates')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Template Selector */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Label htmlFor="template-select" className="font-medium">
          {t('select_template')}
        </Label>
        <Select
          value={selectedTemplateId}
          onValueChange={setSelectedTemplateId}
        >
          <SelectTrigger id="template-select" className="w-full sm:w-[300px]">
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

      {/* Side by side layout on large screens, stacked on small */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Template Properties - Left/Top */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t('template_props')}</CardTitle>
            <p className="text-muted-foreground text-sm">
              {selectedTemplate.description}
            </p>
          </CardHeader>
          <Separator />
          <CardContent className="flex-1 pt-4">
            <ScrollArea className="h-[500px] pr-4">
              <div className="grid gap-4">
                {selectedTemplate.propsSchema.map((field) => (
                  <div key={field.name} className="grid gap-2">
                    <Label htmlFor={field.name}>
                      {field.label}
                      {field.required && (
                        <span className="ml-1 text-destructive">*</span>
                      )}
                    </Label>
                    {renderField(field)}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Live Preview - Right/Bottom */}
        <Card className="flex flex-col p-0">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg">{t('live_preview')}</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDarkMode(!isDarkMode)}
              >
                {isDarkMode ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
                <span className="ml-2 hidden sm:inline">
                  {isDarkMode ? t('light_mode') : t('dark_mode')}
                </span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleCopyHtml}>
                <Copy className="h-4 w-4" />
                <span className="ml-2 hidden sm:inline">{t('copy_html')}</span>
              </Button>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="flex flex-1 flex-col p-0">
            {!mounted ? (
              <div className="flex min-h-[500px] w-full flex-1 items-center justify-center rounded-b-lg">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              <>
                <iframe
                  ref={iframeRef}
                  title="Email Preview"
                  className={`min-h-[500px] w-full flex-1 border-0 ${isDarkMode ? '' : 'rounded-b-lg'}`}
                  sandbox="allow-same-origin"
                />
                {isDarkMode && (
                  <div className="rounded-b-lg border-t bg-muted/50 p-2 text-center text-muted-foreground text-xs">
                    {t('dark_mode_warning')}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
