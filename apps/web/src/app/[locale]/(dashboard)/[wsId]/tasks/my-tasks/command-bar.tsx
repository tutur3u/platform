'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@tuturuuu/ui/popover';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import {useTranslations} from 'next-intl';
import { ArrowUp, ChevronDown, MapPin, Settings, X } from '@tuturuuu/ui/icons';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useState, useMemo } from 'react';
import type { KeyboardEvent } from 'react';

export type CommandMode = 'note' | 'task' | 'ai';

interface CommandBarProps {
  onCreateNote: (content: string) => Promise<void>;
  onCreateTask: (title: string) => void;
  onGenerateAI: (entry: string) => void;
  onOpenBoardSelector: () => void;
  selectedDestination: {
    boardName?: string;
    listName?: string;
  } | null;
  onClearDestination: () => void;
  isLoading?: boolean;
  aiGenerateDescriptions?: boolean;
  aiGeneratePriority?: boolean;
  aiGenerateLabels?: boolean;
  onAiGenerateDescriptionsChange?: (value: boolean) => void;
  onAiGeneratePriorityChange?: (value: boolean) => void;
  onAiGenerateLabelsChange?: (value: boolean) => void;
}

export function CommandBar({
  onCreateNote,
  onCreateTask,
  onGenerateAI,
  onOpenBoardSelector,
  selectedDestination,
  onClearDestination,
  isLoading = false,
  aiGenerateDescriptions = true,
  aiGeneratePriority = true,
  aiGenerateLabels = true,
  onAiGenerateDescriptionsChange,
  onAiGeneratePriorityChange,
  onAiGenerateLabelsChange,
}: CommandBarProps) {
  const [mode, setMode] = useState<CommandMode>('note');
  const [inputText, setInputText] = useState('');
  const t = useTranslations();

  const modeConfig = useMemo(() => ({
    note: {
      label: t('workspace-tasks-tabs.command_bar.mode.note.label'),
      description: t('workspace-tasks-tabs.command_bar.mode.note.description'),
      placeholder: t('workspace-tasks-tabs.command_bar.mode.note.placeholder'),
      action: t('workspace-tasks-tabs.command_bar.action.generate'),
    },
    task: {
      label: t('workspace-tasks-tabs.command_bar.mode.task.label'),
      description: t('workspace-tasks-tabs.command_bar.mode.task.description'),
      placeholder: t('workspace-tasks-tabs.command_bar.mode.task.placeholder'),
      action: t('workspace-tasks-tabs.command_bar.action.generate'),
    },
    ai: {
      label: t('workspace-tasks-tabs.command_bar.mode.ai.label'),
      description: t('workspace-tasks-tabs.command_bar.mode.ai.description'),
      placeholder: t('workspace-tasks-tabs.command_bar.mode.ai.placeholder'),
      action: t('workspace-tasks-tabs.command_bar.action.generate'),
    },
  }), [t]);

  const currentConfig = modeConfig[mode];
  const needsDestination = mode !== 'note';
  const hasDestination = Boolean(
    selectedDestination?.boardName && selectedDestination?.listName
  );
  const canExecute = inputText.trim() && (mode === 'note' || hasDestination);

  const handleAction = async () => {
    if (!inputText.trim()) return;

    try {
      if (mode === 'note') {
        await onCreateNote(inputText.trim());
        setInputText('');
      } else if (mode === 'task') {
        if (!hasDestination) {
          onOpenBoardSelector();
          return;
        }
        onCreateTask(inputText.trim());
        setInputText('');
      } else if (mode === 'ai') {
        if (!hasDestination) {
          onOpenBoardSelector();
          return;
        }
        onGenerateAI(inputText.trim());
        setInputText('');
      }
    } catch (error) {
      console.error('Command bar action error:', error);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleAction();
    }
  };

  return (
    <div className="relative rounded-lg border bg-background shadow-sm">
      <Textarea
        id="my-tasks-command-bar-textarea"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={currentConfig.placeholder}
        className="min-h-[120px] resize-none border-0 pb-14 pr-4 text-base focus-visible:ring-0"
        disabled={isLoading}
      />

      {/* Integrated Controls - Positioned inside textarea at bottom */}
      {/* Left: Location Selector + AI Settings */}
      <div className="absolute bottom-2 left-3 flex items-center gap-2">
        {needsDestination && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenBoardSelector}
              disabled={isLoading}
              className="h-8 w-8 p-0"
              aria-label={t('dashboard.quick_journal.open_board_selector')}
            >
              <MapPin className="h-4 w-4" />
    
            </Button>

            {mode === 'ai' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    disabled={isLoading} 
                    className="h-8 w-8 p-0" 
                    aria-label={t('dashboard.quick_journal.ai_settings')}
                    title="AI Generation Settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72">
                  <div className="space-y-4">
                    <div>
                      <h4 className="mb-3 font-semibold text-sm">
                        {t('dashboard.quick_journal.ai_settings')}
                      </h4>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor="ai-descriptions"
                            className="text-sm font-normal"
                          >
                            {t('dashboard.quick_journal.toggle_descriptions_label')}
                          </Label>
                          <Switch
                            id="ai-descriptions"
                            checked={aiGenerateDescriptions}
                            onCheckedChange={onAiGenerateDescriptionsChange}
                            disabled={isLoading}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor="ai-priority"
                            className="text-sm font-normal"
                          >
                            {t('dashboard.quick_journal.toggle_priority_label')}
                          </Label>
                          <Switch
                            id="ai-priority"
                            checked={aiGeneratePriority}
                            onCheckedChange={onAiGeneratePriorityChange}
                            disabled={isLoading}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor="ai-labels"
                            className="text-sm font-normal"
                          >
                            {t('dashboard.quick_journal.toggle_labels_label')}
                          </Label>
                          <Switch
                            id="ai-labels"
                            checked={aiGenerateLabels}
                            onCheckedChange={onAiGenerateLabelsChange}
                            disabled={isLoading}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {hasDestination && selectedDestination && (
              <Badge
                variant="secondary"
                className="gap-1 pl-2 pr-1 text-xs"
              >
                <span>
                  {selectedDestination.boardName} / {selectedDestination.listName}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearDestination}
                  disabled={isLoading}
                  className="h-4 w-4 p-0 hover:bg-transparent"
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            )}
          </>
        )}
      </div>

      {/* Right: Mode Selector + Action Button */}
      <div className="absolute bottom-2 right-3 flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={isLoading}>
              <span className="text-sm">{currentConfig.label}</span>
              <ChevronDown className="ml-2 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {(Object.entries(modeConfig) as [CommandMode, typeof modeConfig[CommandMode]][]).map(
              ([key, config]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => setMode(key)}
                  className="flex-col items-start gap-1 py-3"
                >
                  <div className="font-semibold">{config.label}</div>
                  <div className="text-muted-foreground text-xs">
                    {config.description}
                  </div>
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          onClick={handleAction}
          disabled={!canExecute || isLoading}
          size="sm"
          className="h-8 w-8 p-0"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
