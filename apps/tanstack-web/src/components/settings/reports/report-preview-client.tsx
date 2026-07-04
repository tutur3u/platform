'use client';

import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import ReportPreview from '@tuturuuu/ui/custom/report-preview';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

interface ReportPreviewClientProps {
  configs: Array<WorkspaceConfig & { value?: string | null }>;
  lang: string;
}

export default function ReportPreviewClient({
  configs,
  lang,
}: ReportPreviewClientProps) {
  const t = useTranslations();

  const getConfig = (id: string): string | null | undefined =>
    configs.find((config) => config.id === id)?.value;

  const parseDynamicText = (text?: string | null): ReactNode => {
    if (!text) return '';

    const segments = text.split(/({{.*?}})/g).filter(Boolean);

    return segments.map((segment, index) => {
      const match = segment.match(/{{(.*?)}}/);
      if (match) {
        const key = match[1]?.trim() || '';
        return (
          <span
            key={key + index}
            className="rounded bg-foreground px-1 py-0.5 font-semibold text-background"
          >
            {key}
          </span>
        );
      }

      return segment;
    });
  };

  return (
    <ReportPreview
      getConfig={getConfig}
      lang={lang}
      parseDynamicText={parseDynamicText}
      t={t}
    />
  );
}
