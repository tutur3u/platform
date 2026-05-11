'use client';

import {
  Brain,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PanelTopClose,
  PanelTopOpen,
} from '@tuturuuu/icons';

type EditorChromeControlsProps = {
  bottomCollapsed: boolean;
  leftCollapsed: boolean;
  npcLabCollapsed: boolean;
  onToggleBottom: () => void;
  onToggleLeft: () => void;
  onToggleNpcLab: () => void;
  onToggleRight: () => void;
  onToggleTop: () => void;
  rightCollapsed: boolean;
  topCollapsed: boolean;
};

export function EditorChromeControls({
  bottomCollapsed,
  leftCollapsed,
  npcLabCollapsed,
  onToggleBottom,
  onToggleLeft,
  onToggleNpcLab,
  onToggleRight,
  onToggleTop,
  rightCollapsed,
  topCollapsed,
}: EditorChromeControlsProps) {
  const items = [
    {
      active: !leftCollapsed,
      icon: leftCollapsed ? PanelLeftOpen : PanelLeftClose,
      label: 'Toggle server sidebar',
      onClick: onToggleLeft,
    },
    {
      active: !rightCollapsed,
      icon: rightCollapsed ? PanelRightOpen : PanelRightClose,
      label: 'Toggle inspector',
      onClick: onToggleRight,
    },
    {
      active: !topCollapsed,
      icon: topCollapsed ? PanelTopOpen : PanelTopClose,
      label: 'Toggle top panels',
      onClick: onToggleTop,
    },
    {
      active: !npcLabCollapsed,
      icon: Brain,
      label: 'Toggle NPC lab',
      onClick: onToggleNpcLab,
    },
    {
      active: !bottomCollapsed,
      icon: bottomCollapsed ? PanelBottomOpen : PanelBottomClose,
      label: 'Toggle tool dock',
      onClick: onToggleBottom,
    },
  ];

  return (
    <div className="pointer-events-auto absolute top-4 right-4 z-30 flex items-center gap-2 rounded-xl border border-border/70 bg-background/92 p-2 shadow-foreground/10 shadow-xl backdrop-blur-md">
      {items.map(({ active, icon: Icon, label, onClick }) => (
        <button
          aria-pressed={active}
          className={[
            'inline-flex h-9 w-9 items-center justify-center rounded-lg border transition',
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
      ))}
    </div>
  );
}
