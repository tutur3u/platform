'use client';

import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import ReportPreview from '@tuturuuu/ui/custom/report-preview';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

interface ReportPreviewClientProps {
  lang: string;
  configs: Array<WorkspaceConfig & { value?: string | null }>;
}

export default function ReportPreviewClient({
  lang,
  configs,
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
      t={t}
      lang={lang}
      parseDynamicText={parseDynamicText}
      getConfig={getConfig}
    />
  );
}
