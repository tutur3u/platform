'use client';

import {
  PanelBottomClose,
  PanelBottomOpen,
  PanelTopClose,
  PanelTopOpen,
} from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';

type EditorChromeControlsProps = {
  bottomCollapsed: boolean;
  onToggleBottom: () => void;
  onToggleTop: () => void;
  topCollapsed: boolean;
};

export function EditorChromeControls({
  bottomCollapsed,
  onToggleBottom,
  onToggleTop,
  topCollapsed,
}: EditorChromeControlsProps) {
  const t = useTranslations('studio.chrome');
  const items = [
    {
      active: !topCollapsed,
      className: 'top-4 left-1/2 -translate-x-1/2',
      icon: topCollapsed ? PanelTopOpen : PanelTopClose,
      label: t('toggle_top'),
      onClick: onToggleTop,
      visible: topCollapsed,
    },
    {
      active: !bottomCollapsed,
      className: 'bottom-4 left-1/2 -translate-x-1/2',
      icon: bottomCollapsed ? PanelBottomOpen : PanelBottomClose,
      label: t('toggle_tool_dock'),
      onClick: onToggleBottom,
      visible: bottomCollapsed,
    },
  ];

  return (
    <>
      {items.map(
        ({ active, className, icon: Icon, label, onClick, visible }) =>
          visible ? (
            <button
              aria-pressed={active}
              className={[
                'pointer-events-auto absolute z-40 inline-flex h-10 w-10 items-center justify-center rounded-lg border bg-background/92 shadow-foreground/10 shadow-xl backdrop-blur-md transition-[background-color,border-color,color,opacity,transform] duration-200 ease-out hover:-translate-y-0.5',
                className,
                active
                  ? 'border-dynamic-green/60 bg-dynamic-green/10 text-dynamic-green'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              ].join(' ')}
              key={label}
              onClick={onClick}
              title={label}
              type="button"
            >
              <Icon className="h-4 w-4" />
            </button>
          ) : null
      )}
    </>
  );
}
