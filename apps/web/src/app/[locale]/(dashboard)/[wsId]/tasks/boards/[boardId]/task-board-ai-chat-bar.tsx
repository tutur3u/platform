'use client';

import { ChevronDown, MessageCircle, Plus, Sparkles, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { TaskPreviewDialog } from '@tuturuuu/ui/tu-do/my-tasks/task-preview-dialog';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  ModeButton,
  TaskBoardMiraChatPopup,
  TaskBoardTaskComposer,
} from './task-board-ai-chat-bar-controls';
import type {
  TaskBoardAiChatBarMode,
  TaskBoardAiChatBarUser,
} from './task-board-ai-chat-bar-types';
import { useTaskBoardAiChatBarTaskFlow } from './use-task-board-ai-chat-bar-task-flow';

const CHAT_POPUP_EXIT_MS = 220;

interface TaskBoardAiChatBarProps {
  assistantName: string;
  boardId: string;
  currentUser: TaskBoardAiChatBarUser;
  wsId: string;
}

export function TaskBoardAiChatBar({
  assistantName,
  boardId,
  currentUser,
  wsId,
}: TaskBoardAiChatBarProps) {
  const tCommon = useTranslations('common');
  const tMira = useTranslations('dashboard.mira_chat');
  const tTasks = useTranslations('ws-tasks');
  const islandRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<TaskBoardAiChatBarMode>('task');
  const [chatPanelResetKey, setChatPanelResetKey] = useState(0);
  const [renderChatPopup, setRenderChatPopup] = useState(false);
  const [chatPopupExiting, setChatPopupExiting] = useState(false);

  const taskFlow = useTaskBoardAiChatBarTaskFlow({
    boardId,
    currentUser,
    expanded,
    wsId,
  });

  useEffect(() => {
    if (!expanded) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (islandRef.current?.contains(target)) return;
      if (
        target.closest(
          '[data-radix-popper-content-wrapper], [role="dialog"], [data-task-board-ai-island-portal]'
        )
      ) {
        return;
      }

      setExpanded(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [expanded]);

  const userName =
    currentUser.display_name || currentUser.full_name || currentUser.email;
  const chatPopupOpen = expanded && mode === 'chat';

  useEffect(() => {
    if (chatPopupOpen) {
      setRenderChatPopup(true);
      setChatPopupExiting(false);
      return;
    }

    if (!renderChatPopup) return;

    setChatPopupExiting(true);
    const timer = window.setTimeout(() => {
      setRenderChatPopup(false);
      setChatPopupExiting(false);
    }, CHAT_POPUP_EXIT_MS);

    return () => window.clearTimeout(timer);
  }, [chatPopupOpen, renderChatPopup]);

  const summaryText = expanded
    ? mode === 'task'
      ? tCommon('add_task')
      : tCommon('ai-assistant')
    : mode === 'task'
      ? tTasks('cmd_ai_placeholder')
      : tMira('placeholder', { name: assistantName });

  return (
    <TooltipProvider>
      <div className="pointer-events-none fixed inset-x-3 bottom-4 z-40 flex justify-center sm:bottom-6">
        <div
          ref={islandRef}
          className={cn(
            'pointer-events-auto flex w-full max-w-xl flex-col items-stretch transition-[max-width,transform] duration-300',
            expanded && mode === 'task' && 'max-w-2xl',
            renderChatPopup && 'max-w-3xl'
          )}
        >
          {renderChatPopup && (
            <TaskBoardMiraChatPopup
              assistantName={assistantName}
              boardId={boardId}
              chatPanelResetKey={chatPanelResetKey}
              currentUser={currentUser}
              open={chatPopupOpen && !chatPopupExiting}
              onResetPanelState={() =>
                setChatPanelResetKey((current) => current + 1)
              }
              userName={userName ?? undefined}
              wsId={wsId}
            />
          )}

          <div
            className={cn(
              'overflow-hidden rounded-2xl border border-border/70 bg-background/90 shadow-lg backdrop-blur-xl',
              'transition-[width,opacity,transform] duration-300',
              expanded ? 'w-full' : 'mx-auto w-full max-w-xl'
            )}
          >
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1 text-left transition hover:bg-muted/70"
                onClick={() => setExpanded(true)}
                aria-expanded={expanded}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs sm:text-sm">
                  {summaryText}
                </span>
                {taskFlow.selectedList && mode === 'task' && !expanded && (
                  <span className="hidden max-w-36 truncate rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground text-xs sm:inline">
                    {taskFlow.selectedList.name || tCommon('list')}
                  </span>
                )}
              </button>

              <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-border/60 bg-muted/40 p-0.5">
                <ModeButton
                  active={mode === 'task'}
                  icon={Plus}
                  onClick={() => {
                    setMode('task');
                    setExpanded(true);
                  }}
                >
                  {tCommon('add_task')}
                </ModeButton>
                <ModeButton
                  active={mode === 'chat'}
                  icon={MessageCircle}
                  onClick={() => {
                    setMode('chat');
                    setExpanded(true);
                  }}
                >
                  {tCommon('ai-assistant')}
                </ModeButton>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 rounded-full"
                    onClick={() => setExpanded((value) => !value)}
                  >
                    {expanded ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4 rotate-180" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {expanded ? tCommon('close') : tCommon('expand')}
                </TooltipContent>
              </Tooltip>
            </div>

            {expanded && mode === 'task' && (
              <TaskBoardTaskComposer
                activeLists={taskFlow.activeLists}
                aiTaskMode={taskFlow.aiTaskMode}
                canCreateTask={taskFlow.canCreateTask}
                isCreating={taskFlow.isWorking}
                listsLoading={taskFlow.listsLoading}
                onAiTaskModeChange={taskFlow.setAiTaskMode}
                onInputChange={taskFlow.setTaskInput}
                onListChange={taskFlow.setSelectedListId}
                onSubmit={taskFlow.handleTaskSubmit}
                onSubmitShortcut={taskFlow.submitTaskInput}
                selectedListId={taskFlow.selectedListId}
                taskInput={taskFlow.taskInput}
              />
            )}
          </div>
        </div>
      </div>
      <TaskPreviewDialog
        open={taskFlow.previewOpen}
        onOpenChange={taskFlow.setPreviewOpen}
        previewEntry={taskFlow.previewEntry}
        pendingTaskTitle={taskFlow.taskInput}
        lastResult={taskFlow.lastResult}
        workspaceLabels={taskFlow.workspaceLabels}
        workspaceProjects={taskFlow.workspaceProjects}
        boardConfig={taskFlow.boardConfig}
        aiGenerateDescriptions
        aiGeneratePriority
        aiGenerateLabels
        clientTimezone={taskFlow.clientTimezone}
        selectedLabelIds={taskFlow.selectedLabelIds}
        setSelectedLabelIds={taskFlow.setSelectedLabelIds}
        currentPreviewIndex={taskFlow.currentPreviewIndex}
        setCurrentPreviewIndex={taskFlow.setCurrentPreviewIndex}
        onConfirmReview={taskFlow.handleConfirmReview}
        isCreating={taskFlow.isWorking}
      />
    </TooltipProvider>
  );
}
