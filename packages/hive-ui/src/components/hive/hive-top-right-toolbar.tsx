'use client';

import {
  Brain,
  Clock,
  Map as MapIcon,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  Users,
  Workflow,
} from '@tuturuuu/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import type { ComponentType, ReactNode } from 'react';
import type { HiveUser } from '../../engine/types';
import { HiveAccountMenu } from './panels/hive-account-menu';

type HiveTopRightToolbarProps = {
  aiContextPanel: ReactNode;
  chatOpen: boolean;
  currentUser: HiveUser;
  miniMapCollapsed: boolean;
  mode: 'agents' | 'timeline' | 'workflows' | 'world';
  npcLabCollapsed: boolean;
  onChangeMode: (mode: 'agents' | 'timeline' | 'workflows' | 'world') => void;
  onToggleChat: () => void;
  onToggleInspector: () => void;
  onToggleMiniMap: () => void;
  onToggleNpcLab: () => void;
  rightCollapsed: boolean;
  serverPicker: ReactNode;
};

export function HiveTopRightToolbar({
  aiContextPanel,
  chatOpen,
  currentUser,
  miniMapCollapsed,
  mode,
  npcLabCollapsed,
  onChangeMode,
  onToggleChat,
  onToggleInspector,
  onToggleMiniMap,
  onToggleNpcLab,
  rightCollapsed,
  serverPicker,
}: HiveTopRightToolbarProps) {
  const chromeT = useTranslations('studio.chrome');

  return (
    <div
      aria-label="Hive top toolbar"
      className="group/hive-top-toolbar pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-1 overflow-visible rounded-xl border border-border/70 bg-background/88 p-1 text-foreground shadow-2xl shadow-foreground/15 ring-1 ring-foreground/5 backdrop-blur-xl transition-[box-shadow,opacity,transform,width] duration-300 ease-out hover:shadow-foreground/20"
      role="toolbar"
    >
      {serverPicker}
      <div className="my-1 h-7 w-px shrink-0 bg-border" />
      {aiContextPanel}
      <div className="my-1 h-7 w-px shrink-0 bg-border" />
      <ToolbarButton
        active={mode === 'agents'}
        icon={Users}
        label={chromeT('mode_agents')}
        onClick={() => onChangeMode('agents')}
      />
      <ToolbarButton
        active={mode === 'world'}
        icon={MapIcon}
        label={chromeT('mode_world')}
        onClick={() => onChangeMode('world')}
      />
      <ToolbarButton
        active={mode === 'workflows'}
        icon={Workflow}
        label={chromeT('mode_workflows')}
        onClick={() => onChangeMode('workflows')}
      />
      <ToolbarButton
        active={mode === 'timeline'}
        icon={Clock}
        label={chromeT('mode_timeline')}
        onClick={() => onChangeMode('timeline')}
      />
      <div className="flex max-w-0 items-center gap-1 overflow-hidden opacity-0 transition-[max-width,opacity,transform] duration-300 ease-out group-focus-within/hive-top-toolbar:max-w-[24rem] group-focus-within/hive-top-toolbar:translate-x-0 group-focus-within/hive-top-toolbar:opacity-100 group-hover/hive-top-toolbar:max-w-[24rem] group-hover/hive-top-toolbar:translate-x-0 group-hover/hive-top-toolbar:opacity-100">
        {mode === 'world' ? (
          <>
            <div className="flex items-center gap-1">
              <ToolbarButton
                active={!rightCollapsed}
                icon={rightCollapsed ? PanelRightOpen : PanelRightClose}
                label={chromeT('toggle_inspector')}
                onClick={onToggleInspector}
              />
              <ToolbarButton
                active={!npcLabCollapsed}
                icon={Brain}
                label={chromeT('toggle_npc_lab')}
                onClick={onToggleNpcLab}
              />
              <ToolbarButton
                active={!miniMapCollapsed}
                icon={MapIcon}
                label={chromeT('toggle_minimap')}
                onClick={onToggleMiniMap}
              />
              <ToolbarButton
                active={chatOpen}
                icon={MessageSquareText}
                label={chatOpen ? chromeT('close_chat') : chromeT('open_chat')}
                onClick={onToggleChat}
              />
            </div>
            <div className="my-1 h-7 w-px shrink-0 bg-border" />
          </>
        ) : null}
        <HiveAccountMenu user={currentUser} variant="icon" />
      </div>
    </div>
  );
}

function ToolbarButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          aria-pressed={active}
          className={[
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-[background-color,border-color,box-shadow,color,transform] duration-200 ease-out hover:-translate-y-0.5',
            active
              ? 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green shadow-dynamic-green/20 shadow-inner'
              : 'border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground',
          ].join(' ')}
          onClick={onClick}
          type="button"
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
