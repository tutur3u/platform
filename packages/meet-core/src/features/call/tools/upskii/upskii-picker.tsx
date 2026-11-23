'use client';

import { ArrowLeft } from '@tuturuuu/icons';
import type { UpskiiContentItem } from '@tuturuuu/internal-api/upskii-content';
import type { UpskiiPresentationItem } from '@tuturuuu/realtime/meet/room-upskii-presentation';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ToolIconAction } from '../tool-ui';
import { UpskiiContentList } from './upskii-content-list';
import { toPresentationItem } from './upskii-list-state';
import { useUpskiiContent } from './use-upskii-content';

type Tab = 'lessons' | 'assessments';

/** Where the presenter is in the picker; a class is chosen before its items. */
export type UpskiiPickerStep =
  | { kind: 'classes' }
  | { kind: 'class'; classId: string; classTitle: string; tab: Tab };

/**
 * The presenter chooses a class, then a lesson to present or an assessment to
 * launch. Lists load through the presenter's own session only.
 */
export function UpskiiPicker({
  busy,
  onPresent,
}: {
  busy: boolean;
  onPresent: (item: UpskiiPresentationItem) => void;
}) {
  const t = useTranslations('meet.call.upskii');
  const [step, setStep] = useState<UpskiiPickerStep>({ kind: 'classes' });
  const classes = useUpskiiContent({ kind: 'classes', enabled: true });
  const inClass = step.kind === 'class' ? step : null;
  const items = useUpskiiContent({
    kind: inClass?.tab ?? 'lessons',
    classId: inClass?.classId ?? null,
    enabled: !!inClass,
  });

  if (!inClass)
    return (
      <UpskiiContentList
        state={classes.state}
        emptyTitle={t('empty_classes')}
        onRetry={classes.retry}
        onLoadMore={classes.loadMore}
        onSelect={(item: UpskiiContentItem) =>
          setStep({
            kind: 'class',
            classId: item.id,
            classTitle: item.title,
            tab: 'lessons',
          })
        }
      />
    );

  const present = (item: UpskiiContentItem) => {
    if (busy) return;
    const shared = toPresentationItem(item, inClass.classTitle);
    if (shared) onPresent(shared);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <ToolIconAction
          icon={ArrowLeft}
          label={t('back')}
          onClick={() => setStep({ kind: 'classes' })}
        />
        <h3 className="min-w-0 truncate font-semibold text-sm">
          {inClass.classTitle}
        </h3>
      </div>
      <Tabs
        value={inClass.tab}
        onValueChange={(tab) =>
          setStep({ ...inClass, tab: tab === 'assessments' ? tab : 'lessons' })
        }
      >
        <TabsList className="w-full">
          <TabsTrigger value="lessons" className="flex-1">
            {t('lessons')}
          </TabsTrigger>
          <TabsTrigger value="assessments" className="flex-1">
            {t('assessments')}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <UpskiiContentList
        state={items.state}
        emptyTitle={
          inClass.tab === 'lessons'
            ? t('empty_lessons')
            : t('empty_assessments')
        }
        onRetry={items.retry}
        onLoadMore={items.loadMore}
        onSelect={present}
        renderAction={() => (
          <span className="shrink-0 font-medium text-primary text-xs">
            {inClass.tab === 'lessons' ? t('present') : t('launch')}
          </span>
        )}
      />
    </div>
  );
}
