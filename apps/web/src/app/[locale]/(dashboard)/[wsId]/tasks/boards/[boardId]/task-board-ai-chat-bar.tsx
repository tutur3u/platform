'use client';

import { MessageCircle, Plus } from '@tuturuuu/icons';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
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
  const tTasks = useTranslations('ws-tasks');
  const islandRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mode, setMode] = useState<TaskBoardAiChatBarMode>('task');
  const [chatPanelResetKey, setChatPanelResetKey] = useState(0);
  const [renderChatPopup, setRenderChatPopup] = useState(false);
  const [chatPopupExiting, setChatPopupExiting] = useState(false);
  const [taskFocusSignal, setTaskFocusSignal] = useState(0);
  const [assistantFocusSignal, setAssistantFocusSignal] = useState(0);
  const islandExpanded = expanded || hovered;

  const taskFlow = useTaskBoardAiChatBarTaskFlow({
    boardId,
    currentUser,
    expanded: islandExpanded,
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
  const taskComposerOpen = islandExpanded && mode === 'task' && !chatPopupOpen;
  const showTaskSummary = taskComposerOpen;
  const showSwitcherLabels = islandExpanded && mode === 'task';

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

  const taskSummaryText = taskFlow.aiTaskMode
    ? tTasks('cmd_ai_placeholder')
    : tTasks('cmd_task_placeholder');

  const openTaskComposer = () => {
    setMode('task');
    setExpanded(true);
    setTaskFocusSignal((current) => current + 1);
  };

  const openAssistant = () => {
    setMode('chat');
    setExpanded(true);
    setAssistantFocusSignal((current) => current + 1);
  };

  return (
    <TooltipProvider>
      <div className="pointer-events-none fixed inset-x-3 bottom-4 z-40 flex justify-center sm:bottom-6">
        <div
          ref={islandRef}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => setHovered(true)}
          onBlurCapture={(event) => {
            const nextTarget = event.relatedTarget;
            if (
              !(nextTarget instanceof Node) ||
              !event.currentTarget.contains(nextTarget)
            ) {
              setHovered(false);
            }
          }}
          className={cn(
            'pointer-events-auto flex w-full flex-col items-stretch transition-[max-width,opacity,transform] duration-300 ease-out',
            showTaskSummary ? 'max-w-2xl' : 'max-w-[6rem]',
            renderChatPopup && 'max-w-3xl'
          )}
        >
          {renderChatPopup && (
            <TaskBoardMiraChatPopup
              assistantName={assistantName}
              autoFocusSignal={assistantFocusSignal}
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
              'mx-auto transition-[width,max-width,opacity,transform] duration-300 ease-out',
              showTaskSummary ? 'w-full max-w-2xl' : 'w-auto max-w-[6rem]',
              islandExpanded
                ? 'scale-100 opacity-100'
                : 'scale-[0.98] opacity-95'
            )}
          >
            <div
              className={cn(
                'flex items-center gap-1.5 transition-[padding] duration-300 ease-out',
                showTaskSummary ? 'px-2 py-1.5' : 'p-1.5'
              )}
            >
              <button
                type="button"
                className={cn(
                  'flex min-w-0 items-center rounded-xl text-left transition-[background-color,opacity,max-width,padding,transform] duration-300 ease-out hover:bg-muted/70',
                  showTaskSummary
                    ? 'max-w-lg flex-1 px-2 py-1 opacity-100'
                    : 'pointer-events-none max-w-0 overflow-hidden p-0 opacity-0'
                )}
                onClick={openTaskComposer}
                aria-expanded={taskComposerOpen}
                aria-hidden={!showTaskSummary}
                tabIndex={showTaskSummary ? 0 : -1}
              >
                <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs sm:text-sm">
                  {taskSummaryText}
                </span>
                {taskFlow.selectedList && (
                  <span className="hidden max-w-36 truncate rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground text-xs sm:inline">
                    {taskFlow.selectedList.name || tCommon('list')}
                  </span>
                )}
              </button>

              <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-border/60 bg-muted/40 p-0.5">
                <ModeButton
                  active={mode === 'task'}
                  icon={Plus}
                  onClick={openTaskComposer}
                  showLabel={showSwitcherLabels}
                >
                  {tCommon('add_task')}
                </ModeButton>
                <ModeButton
                  active={mode === 'chat'}
                  icon={MessageCircle}
                  onClick={openAssistant}
                  showLabel={showSwitcherLabels}
                >
                  {tCommon('ai-assistant')}
                </ModeButton>
              </div>
            </div>

            <div
              className={cn(
                'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
                taskComposerOpen
                  ? 'grid-rows-[1fr] opacity-100'
                  : 'grid-rows-[0fr] opacity-0'
              )}
            >
              <div className="overflow-hidden">
                <TaskBoardTaskComposer
                  activeLists={taskFlow.activeLists}
                  aiTaskMode={taskFlow.aiTaskMode}
                  autoFocusSignal={taskFocusSignal}
                  canCreateTask={taskFlow.canCreateTask}
                  isCreating={taskFlow.isWorking}
                  listsLoading={taskFlow.listsLoading}
                  onAiTaskModeChange={taskFlow.setAiTaskMode}
                  onInputChange={taskFlow.setTaskInput}
                  onListChange={taskFlow.setSelectedListId}
                  onSubmit={taskFlow.handleTaskSubmit}
                  onSubmitShortcut={taskFlow.submitTaskInput}
                  open={taskComposerOpen}
                  selectedListId={taskFlow.selectedListId}
                  taskInput={taskFlow.taskInput}
                />
              </div>
            </div>
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
