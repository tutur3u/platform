'use client';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@tuturuuu/ui/resizable';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { type CallLayout, useCompactStage } from './call-stage';

/** Fixed child slots keep the call's media mounted when collaboration opens. */
export function CollaborationStageLayout({
  content,
  stage,
  layout,
}: {
  content: ReactNode;
  stage: ReactNode;
  layout: CallLayout;
}) {
  const t = useTranslations('meet.call');
  const mobile = useCompactStage();
  const split = !!content && !!stage;
  const stageDefault = mobile
    ? 25
    : layout === 'spotlight'
      ? 20
      : layout === 'grid'
        ? 40
        : 25;
  return (
    <ResizablePanelGroup
      direction={mobile ? 'vertical' : 'horizontal'}
      className="min-h-0 min-w-0"
    >
      {content && <ResizablePanel minSize={55}>{content}</ResizablePanel>}
      {split && (
        <ResizableHandle
          aria-label={t('resize_collaboration')}
          className={
            mobile
              ? 'h-2 w-full cursor-row-resize after:inset-auto after:h-3 after:w-full after:translate-x-0 [&>div]:rotate-90'
              : 'w-2'
          }
          withHandle
        />
      )}
      {stage && (
        <ResizablePanel
          defaultSize={split ? stageDefault : undefined}
          minSize={split ? 15 : undefined}
          maxSize={split ? 45 : undefined}
        >
          {stage}
        </ResizablePanel>
      )}
    </ResizablePanelGroup>
  );
}
