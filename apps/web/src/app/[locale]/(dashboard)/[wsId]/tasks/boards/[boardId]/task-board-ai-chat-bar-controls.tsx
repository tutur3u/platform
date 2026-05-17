'use client';

import { Bot, Loader2, Send, WandSparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ComponentType, FormEvent, ReactNode } from 'react';
import MiraChatPanel from '../../../(dashboard)/components/mira-chat-panel';
import type {
  TaskBoardAiChatBarList,
  TaskBoardAiChatBarUser,
} from './task-board-ai-chat-bar-types';

export function ModeButton({
  active,
  children,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'secondary' : 'ghost'}
      className={cn(
        'h-7 shrink-0 gap-1.5 rounded-full px-2.5 text-xs transition-colors',
        active && 'bg-dynamic-purple/10 text-dynamic-purple'
      )}
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{children}</span>
    </Button>
  );
}

export function TaskBoardMiraChatPopup({
  assistantName,
  boardId,
  chatPanelResetKey,
  currentUser,
  open,
  onResetPanelState,
  userName,
  wsId,
}: {
  assistantName: string;
  boardId: string;
  chatPanelResetKey: number;
  currentUser: TaskBoardAiChatBarUser;
  open: boolean;
  onResetPanelState: () => void;
  userName?: string;
  wsId: string;
}) {
  return (
    <div
      className={cn(
        'mb-2 flex h-[min(62vh,34rem)] min-h-72 origin-bottom flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/95 p-1 shadow-xl backdrop-blur-xl',
        'transition-[opacity,transform] duration-200 ease-out',
        open
          ? 'translate-y-0 scale-100 opacity-100'
          : 'pointer-events-none translate-y-3 scale-[0.98] opacity-0'
      )}
    >
      <MiraChatPanel
        key={`${wsId}-${boardId}-${chatPanelResetKey}`}
        wsId={wsId}
        taskBoardId={boardId}
        assistantName={assistantName}
        userName={userName}
        userAvatarUrl={currentUser.avatar_url}
        onResetPanelState={onResetPanelState}
      />
    </div>
  );
}

export function TaskBoardTaskComposer({
  activeLists,
  aiTaskMode,
  canCreateTask,
  isCreating,
  listsLoading,
  onAiTaskModeChange,
  onInputChange,
  onListChange,
  onSubmit,
  onSubmitShortcut,
  selectedListId,
  taskInput,
}: {
  activeLists: TaskBoardAiChatBarList[];
  aiTaskMode: boolean;
  canCreateTask: boolean;
  isCreating: boolean;
  listsLoading: boolean;
  onAiTaskModeChange: (value: boolean) => void;
  onInputChange: (value: string) => void;
  onListChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onSubmitShortcut: () => void;
  selectedListId: string;
  taskInput: string;
}) {
  const tCommon = useTranslations('common');
  const tTasks = useTranslations('ws-tasks');

  return (
    <form
      className="border-border/70 border-t px-2 pt-2 pb-2"
      onSubmit={onSubmit}
    >
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Textarea
            value={taskInput}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) return;
              event.preventDefault();
              if (canCreateTask && !isCreating) {
                onSubmitShortcut();
              }
            }}
            placeholder={
              aiTaskMode
                ? tTasks('cmd_ai_placeholder')
                : tTasks('cmd_task_placeholder')
            }
            className="min-h-10 resize-none rounded-xl border-border/70 bg-background/70 px-3 py-2 text-sm"
            disabled={isCreating}
          />
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Select
            value={selectedListId}
            onValueChange={onListChange}
            disabled={listsLoading || isCreating}
          >
            <SelectTrigger className="h-9 w-32 rounded-xl sm:w-36">
              <SelectValue
                placeholder={
                  listsLoading
                    ? tCommon('loading')
                    : tCommon('select_or_create_list')
                }
              />
            </SelectTrigger>
            <SelectContent data-task-board-ai-island-portal>
              {activeLists.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name || tCommon('list')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex h-9 items-center gap-1.5 rounded-xl border border-border/70 px-2">
            <Bot
              className={cn(
                'h-4 w-4',
                aiTaskMode ? 'text-dynamic-purple' : 'text-muted-foreground'
              )}
            />
            <Switch
              checked={aiTaskMode}
              onCheckedChange={onAiTaskModeChange}
              disabled={isCreating}
              aria-label={tCommon('generate_with_ai')}
            />
          </div>

          <Button
            type="submit"
            size="icon"
            className="h-9 w-9 rounded-xl"
            disabled={!canCreateTask || isCreating}
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : aiTaskMode ? (
              <WandSparkles className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="sr-only">
              {aiTaskMode ? tCommon('generate') : tTasks('create_task')}
            </span>
          </Button>
        </div>
      </div>
    </form>
  );
}
