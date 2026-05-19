'use client';

import { MessageCircle, Plus } from '@tuturuuu/icons';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { TaskPreviewDialog } from '@tuturuuu/ui/tu-do/my-tasks/task-preview-dialog';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ModeButton,
  TaskBoardMiraChatPopup,
  TaskBoardTaskComposer,
} from './task-board-ai-chat-bar-controls';
import type {
  TaskBoardAiChatBarMode,
  TaskBoardAiChatBarUser,
} from './task-board-ai-chat-bar-types';
import { buildTaskBoardMiraContext } from './task-board-ai-chat-bar-utils';
import { useTaskBoardAiChatBarTaskFlow } from './use-task-board-ai-chat-bar-task-flow';

const CHAT_POPUP_EXIT_MS = 220;
const HOVER_CLOSE_DELAY_MS = 180;
const HOVER_OPEN_DELAY_MS = 80;
const HOVER_REOPEN_COOLDOWN_MS = 220;

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
  const hoverCloseTimerRef = useRef<number | null>(null);
  const hoverOpenTimerRef = useRef<number | null>(null);
  const lastHoverCloseAtRef = useRef(0);
  const [expanded, setExpanded] = useState(false);
  const [hoverPreview, setHoverPreview] = useState(false);
  const [mode, setMode] = useState<TaskBoardAiChatBarMode>('task');
  const [chatPanelResetKey, setChatPanelResetKey] = useState(0);
  const [renderChatPopup, setRenderChatPopup] = useState(false);
  const [chatPopupExiting, setChatPopupExiting] = useState(false);
  const [chatMaximized, setChatMaximized] = useState(false);
  const [taskFocusSignal, setTaskFocusSignal] = useState(0);
  const [assistantFocusSignal, setAssistantFocusSignal] = useState(0);
  const islandExpanded = expanded || hoverPreview;

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

  useEffect(() => {
    return () => {
      if (hoverOpenTimerRef.current !== null) {
        window.clearTimeout(hoverOpenTimerRef.current);
      }
      if (hoverCloseTimerRef.current !== null) {
        window.clearTimeout(hoverCloseTimerRef.current);
      }
    };
  }, []);

  const userName =
    currentUser.display_name || currentUser.full_name || currentUser.email;
  const chatPopupOpen = expanded && mode === 'chat';
  const taskComposerOpen = expanded && mode === 'task' && !chatPopupOpen;
  const showTaskSummary =
    hoverPreview && mode === 'task' && !chatPopupOpen && !taskComposerOpen;
  const islandWide = taskComposerOpen || showTaskSummary;
  const showSwitcherLabels = islandExpanded && mode === 'task';
  const taskBoardContext = useMemo(
    () =>
      buildTaskBoardMiraContext({
        activeLists: taskFlow.activeLists,
        boardId,
        boardName: taskFlow.boardName,
        wsId,
      }),
    [boardId, taskFlow.activeLists, taskFlow.boardName, wsId]
  );

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
    setHoverPreview(false);
    setTaskFocusSignal((current) => current + 1);
  };

  const openAssistant = () => {
    setMode('chat');
    setExpanded(true);
    setHoverPreview(false);
    setAssistantFocusSignal((current) => current + 1);
  };

  const clearHoverTimers = () => {
    if (hoverOpenTimerRef.current !== null) {
      window.clearTimeout(hoverOpenTimerRef.current);
      hoverOpenTimerRef.current = null;
    }
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  };

  const scheduleHoverOpen = () => {
    if (expanded) return;
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
    if (
      lastHoverCloseAtRef.current > 0 &&
      Date.now() - lastHoverCloseAtRef.current < HOVER_REOPEN_COOLDOWN_MS
    ) {
      return;
    }
    if (hoverPreview || hoverOpenTimerRef.current !== null) return;
    hoverOpenTimerRef.current = window.setTimeout(() => {
      setHoverPreview(true);
      hoverOpenTimerRef.current = null;
    }, HOVER_OPEN_DELAY_MS);
  };

  const scheduleHoverClose = () => {
    if (expanded) return;
    if (hoverOpenTimerRef.current !== null) {
      window.clearTimeout(hoverOpenTimerRef.current);
      hoverOpenTimerRef.current = null;
    }
    if (!hoverPreview) return;
    if (hoverCloseTimerRef.current !== null) return;

    hoverCloseTimerRef.current = window.setTimeout(() => {
      setHoverPreview(false);
      lastHoverCloseAtRef.current = Date.now();
      hoverCloseTimerRef.current = null;
    }, HOVER_CLOSE_DELAY_MS);
  };

  return (
    <TooltipProvider>
      <div className="pointer-events-none fixed inset-x-3 bottom-4 z-40 flex justify-center sm:bottom-6">
        <div
          ref={islandRef}
          onMouseEnter={scheduleHoverOpen}
          onMouseLeave={scheduleHoverClose}
          onFocusCapture={() => {
            clearHoverTimers();
            setHoverPreview(true);
          }}
          onBlurCapture={(event) => {
            const nextTarget = event.relatedTarget;
            if (
              !(nextTarget instanceof Node) ||
              !event.currentTarget.contains(nextTarget)
            ) {
              scheduleHoverClose();
            }
          }}
          className={cn(
            'pointer-events-auto flex w-full flex-col items-stretch transition-[max-width,opacity,transform] duration-300 ease-out',
            islandWide ? 'max-w-2xl' : 'max-w-[6rem]',
            renderChatPopup &&
              (chatMaximized ? 'max-w-[min(96vw,80rem)]' : 'max-w-3xl')
          )}
        >
          {renderChatPopup && (
            <TaskBoardMiraChatPopup
              assistantName={assistantName}
              autoFocusSignal={assistantFocusSignal}
              boardId={boardId}
              chatPanelResetKey={chatPanelResetKey}
              currentUser={currentUser}
              maximized={chatMaximized}
              open={chatPopupOpen && !chatPopupExiting}
              onResetPanelState={() =>
                setChatPanelResetKey((current) => current + 1)
              }
              onToggleMaximized={() => setChatMaximized((value) => !value)}
              taskBoardContext={taskBoardContext}
              userName={userName ?? undefined}
              wsId={wsId}
            />
          )}

          <div
            className={cn(
              'overflow-hidden rounded-2xl border border-border/70 bg-background/90 shadow-lg backdrop-blur-xl',
              'mx-auto transition-[width,max-width,opacity,transform] duration-300 ease-out',
              islandWide ? 'w-full max-w-2xl' : 'w-auto max-w-[6rem]',
              islandExpanded
                ? 'scale-100 opacity-100'
                : 'scale-[0.98] opacity-70'
            )}
          >
            <div
              className={cn(
                'flex items-center gap-1.5 transition-[padding] duration-300 ease-out',
                islandWide ? 'px-2 py-1.5' : 'p-1.5'
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
