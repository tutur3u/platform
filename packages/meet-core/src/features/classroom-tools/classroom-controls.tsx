'use client';

import { LayoutGrid, PenTool } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { ControlButton } from '../call/components/control-bar';
import type { ClassroomTool } from './classroom-client';

export function ClassroomControls({
  active,
  toggle,
}: {
  active: string | null;
  toggle: (tool: ClassroomTool) => void;
}) {
  const t = useTranslations('meet.classroom_tools');
  return (
    <>
      <ControlButton
        icon={PenTool}
        label={t('whiteboard.title')}
        active={active === 'whiteboard'}
        onClick={() => toggle('whiteboard')}
      />
      <ControlButton
        icon={LayoutGrid}
        label={t('breakouts.title')}
        active={active === 'breakouts'}
        onClick={() => toggle('breakouts')}
      />
    </>
  );
}
