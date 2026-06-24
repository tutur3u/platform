'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'use-intl';
import type { TemplateDefinition } from './template-definitions';
import { TemplateField } from './template-field';

type TemplatePropertiesPanelProps = {
  formValues: Record<string, unknown>;
  onFieldChange: (fieldName: string, value: boolean | number | string) => void;
  template: TemplateDefinition;
};

export function TemplatePropertiesPanel({
  formValues,
  onFieldChange,
  template,
}: TemplatePropertiesPanelProps) {
  const t = useTranslations('email-templates');

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{t('template_props')}</CardTitle>
        <p className="text-muted-foreground text-sm">{template.description}</p>
      </CardHeader>
      <Separator />
      <CardContent className="flex-1 pt-4">
        <ScrollArea className="h-125 pr-4">
          <div className="grid gap-4">
            {template.propsSchema.map((field) => (
              <TemplateField
                field={field}
                key={field.name}
                onChange={onFieldChange}
                value={formValues[field.name]}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
