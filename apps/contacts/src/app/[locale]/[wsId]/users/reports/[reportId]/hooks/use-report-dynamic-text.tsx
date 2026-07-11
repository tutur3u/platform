'use client';

import type { ReactNode } from 'react';
import { useCallback } from 'react';

interface ReportDynamicTextContext {
  userName?: string | null;
  groupName?: string | null;
  groupManagerName?: string | null;
}

export function parseReportDynamicText(
  text: string | null | undefined,
  { userName, groupName, groupManagerName }: ReportDynamicTextContext
): ReactNode {
  if (!text) return '';

  const segments = text.split(/({{.*?}})/g).filter(Boolean);

  return segments.map((segment, index) => {
    const match = segment.match(/{{(.*?)}}/);
    if (!match) return segment;

    const key = match[1]?.trim() || '';

    if (key === 'user_name') {
      return (
        <span key={key + index} className="font-semibold">
          {userName || '...'}
        </span>
      );
    }

    if (key === 'group_name') {
      return (
        <span key={key + index} className="font-semibold">
          {groupName || '...'}
        </span>
      );
    }

    if (key === 'group_manager_name') {
      return (
        <span key={key + index} className="font-semibold">
          {groupManagerName || '...'}
        </span>
      );
    }

    return (
      <span
        key={key + index}
        className="rounded bg-foreground px-1 py-0.5 font-semibold text-background"
      >
        {key}
      </span>
    );
  });
}

export function useReportDynamicText(context: ReportDynamicTextContext) {
  const { userName, groupName, groupManagerName } = context;

  return useCallback(
    (text?: string | null) =>
      parseReportDynamicText(text, {
        userName,
        groupName,
        groupManagerName,
      }),
    [groupManagerName, groupName, userName]
  );
}
