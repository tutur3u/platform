'use client';

import {
  Brain,
  MessageSquareText,
  PanelBottomClose,
  PanelBottomOpen,
  PanelRightClose,
  PanelRightOpen,
  PanelTopClose,
  PanelTopOpen,
} from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';

type EditorChromeControlsProps = {
  bottomCollapsed: boolean;
  chatOpen: boolean;
  npcLabCollapsed: boolean;
  onToggleBottom: () => void;
  onToggleChat: () => void;
  onToggleNpcLab: () => void;
  onToggleRight: () => void;
  onToggleTop: () => void;
  rightCollapsed: boolean;
  topCollapsed: boolean;
};

export function EditorChromeControls({
  bottomCollapsed,
  chatOpen,
  npcLabCollapsed,
  onToggleBottom,
  onToggleChat,
  onToggleNpcLab,
  onToggleRight,
  onToggleTop,
  rightCollapsed,
  topCollapsed,
}: EditorChromeControlsProps) {
  const t = useTranslations('studio.chrome');
  const items = [
    {
      active: !rightCollapsed,
      className: 'top-52 right-4',
      icon: rightCollapsed ? PanelRightOpen : PanelRightClose,
      label: t('toggle_inspector'),
      onClick: onToggleRight,
      visible: rightCollapsed,
    },
    {
      active: !topCollapsed,
      className: 'top-4 left-1/2 -translate-x-1/2',
      icon: topCollapsed ? PanelTopOpen : PanelTopClose,
      label: t('toggle_top'),
      onClick: onToggleTop,
      visible: topCollapsed,
    },
    {
      active: !npcLabCollapsed,
      className: rightCollapsed ? 'top-20 right-4' : 'top-20 right-[404px]',
      icon: Brain,
      label: t('toggle_npc_lab'),
      onClick: onToggleNpcLab,
      visible: npcLabCollapsed && !topCollapsed,
    },
    {
      active: chatOpen,
      className: bottomCollapsed ? 'right-4 bottom-16' : 'right-4 bottom-28',
      icon: MessageSquareText,
      label: chatOpen ? t('close_chat') : t('open_chat'),
      onClick: onToggleChat,
      visible: true,
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
