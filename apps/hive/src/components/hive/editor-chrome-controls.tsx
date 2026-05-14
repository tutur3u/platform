'use client';

import {
  Brain,
  PanelBottomClose,
  PanelBottomOpen,
  PanelRightClose,
  PanelRightOpen,
  PanelTopClose,
  PanelTopOpen,
} from '@tuturuuu/icons';

type EditorChromeControlsProps = {
  bottomCollapsed: boolean;
  npcLabCollapsed: boolean;
  onToggleBottom: () => void;
  onToggleNpcLab: () => void;
  onToggleRight: () => void;
  onToggleTop: () => void;
  rightCollapsed: boolean;
  topCollapsed: boolean;
};

export function EditorChromeControls({
  bottomCollapsed,
  npcLabCollapsed,
  onToggleBottom,
  onToggleNpcLab,
  onToggleRight,
  onToggleTop,
  rightCollapsed,
  topCollapsed,
}: EditorChromeControlsProps) {
  const items = [
    {
      active: !rightCollapsed,
      className: 'top-52 right-4',
      icon: rightCollapsed ? PanelRightOpen : PanelRightClose,
      label: 'Toggle inspector',
      onClick: onToggleRight,
      visible: rightCollapsed,
    },
    {
      active: !topCollapsed,
      className: 'top-4 left-1/2 -translate-x-1/2',
      icon: topCollapsed ? PanelTopOpen : PanelTopClose,
      label: 'Toggle top panels',
      onClick: onToggleTop,
      visible: topCollapsed,
    },
    {
      active: !npcLabCollapsed,
      className: rightCollapsed ? 'top-20 right-4' : 'top-20 right-[404px]',
      icon: Brain,
      label: 'Toggle NPC lab',
      onClick: onToggleNpcLab,
      visible: npcLabCollapsed && !topCollapsed,
    },
    {
      active: !bottomCollapsed,
      className: 'bottom-4 left-1/2 -translate-x-1/2',
      icon: bottomCollapsed ? PanelBottomOpen : PanelBottomClose,
      label: 'Toggle tool dock',
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
                'pointer-events-auto absolute z-40 inline-flex h-10 w-10 items-center justify-center rounded-lg border bg-background/92 shadow-foreground/10 shadow-xl backdrop-blur-md transition',
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
