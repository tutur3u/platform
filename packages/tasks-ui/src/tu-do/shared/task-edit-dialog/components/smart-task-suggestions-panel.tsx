'use client';

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
  FolderKanban,
  ListTodo,
  Loader2,
  Sparkles,
  Tag,
  Timer,
  X,
} from '@tuturuuu/icons';
import type { WorkspaceTaskSuggestionTask } from '@tuturuuu/internal-api/tasks';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';

interface SmartTaskSuggestionsButtonProps {
  disabled?: boolean;
  isLoading?: boolean;
  onClick: () => void;
}

interface SmartTaskSuggestionsPanelProps {
  suggestions: WorkspaceTaskSuggestionTask[];
  selectedSuggestionIds: string[];
  createErrors?: Record<string, string>;
  creatingSuggestionIds?: string[];
  errorMessage?: string | null;
  isCreatingSelected?: boolean;
  isLoading?: boolean;
  onApplyFirst: () => void;
  onApplySuggestion: (suggestion: WorkspaceTaskSuggestionTask) => void;
  onClose: () => void;
  onCreateSelected: () => void;
  onRetry: () => void;
  onToggleSuggestion: (suggestionId: string) => void;
}

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function SuggestionChip({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <Badge
      variant="secondary"
      className="h-6 gap-1 rounded-md px-1.5 font-normal text-xs"
    >
      {icon}
      <span className="max-w-28 truncate">{children}</span>
    </Badge>
  );
}

function SuggestionCard({
  creating,
  error,
  multi,
  onApply,
  onToggle,
  selected,
  suggestion,
}: {
  creating?: boolean;
  error?: string;
  multi: boolean;
  onApply: () => void;
  onToggle: () => void;
  selected: boolean;
  suggestion: WorkspaceTaskSuggestionTask;
}) {
  const t = useTranslations('ws-task-boards.dialog');

  return (
    <div
      className={cn(
        'rounded-lg border bg-background p-3 transition-colors',
        selected && 'border-dynamic-blue/60 bg-dynamic-blue/5'
      )}
    >
      <div className="flex items-start gap-2">
        {multi && (
          <Checkbox
            aria-label={t('smart_select_suggestion')}
            checked={selected}
            className="mt-0.5"
            onCheckedChange={onToggle}
          />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium text-sm">
                {suggestion.title}
              </div>
              {suggestion.description && (
                <div className="line-clamp-2 text-muted-foreground text-xs">
                  {suggestion.description}
                </div>
              )}
            </div>
            {!multi && (
              <Button size="sm" type="button" onClick={onApply}>
                <Sparkles className="h-4 w-4" />
                {t('smart_apply_suggestion')}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {suggestion.listName && (
              <SuggestionChip icon={<ListTodo className="h-3 w-3" />}>
                {suggestion.listName}
              </SuggestionChip>
            )}
            {suggestion.priority && (
              <SuggestionChip icon={<Flag className="h-3 w-3" />}>
                {t(`priority.${suggestion.priority}`)}
              </SuggestionChip>
            )}
            {suggestion.endDate && (
              <SuggestionChip icon={<Calendar className="h-3 w-3" />}>
                {dayjs(suggestion.endDate).format('MMM D')}
              </SuggestionChip>
            )}
            {suggestion.durationMinutes && (
              <SuggestionChip icon={<Clock className="h-3 w-3" />}>
                {formatDuration(suggestion.durationMinutes)}
              </SuggestionChip>
            )}
            {suggestion.estimationPoints != null && (
              <SuggestionChip icon={<Timer className="h-3 w-3" />}>
                {suggestion.estimationPoints}
              </SuggestionChip>
            )}
            {suggestion.labels.map((label) => (
              <SuggestionChip key={label.id} icon={<Tag className="h-3 w-3" />}>
                {label.name}
              </SuggestionChip>
            ))}
            {suggestion.projects.map((project) => (
              <SuggestionChip
                key={project.id}
                icon={<FolderKanban className="h-3 w-3" />}
              >
                {project.name}
              </SuggestionChip>
            ))}
          </div>

          {suggestion.reason && (
            <div className="text-muted-foreground text-xs">
              {suggestion.reason}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-1.5 text-destructive text-xs">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}

          {creating && (
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('smart_creating_task')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SmartTaskSuggestionsButton({
  disabled,
  isLoading,
  onClick,
}: SmartTaskSuggestionsButtonProps) {
  const t = useTranslations('ws-task-boards.dialog');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('smart_suggest')}
          disabled={disabled || isLoading}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onClick}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{t('smart_suggest')}</TooltipContent>
    </Tooltip>
  );
}

export function SmartTaskSuggestionsPanel({
  suggestions,
  selectedSuggestionIds,
  createErrors = {},
  creatingSuggestionIds = [],
  errorMessage,
  isCreatingSelected,
  isLoading,
  onApplyFirst,
  onApplySuggestion,
  onClose,
  onCreateSelected,
  onRetry,
  onToggleSuggestion,
}: SmartTaskSuggestionsPanelProps) {
  const t = useTranslations('ws-task-boards.dialog');
  const selectedCount = selectedSuggestionIds.length;

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span>{t('smart_generating')}</span>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0 space-y-1">
              <div className="font-medium text-sm">
                {t('smart_suggestions_failed')}
              </div>
              <div className="text-muted-foreground text-xs">
                {errorMessage}
              </div>
            </div>
          </div>
          <Button size="sm" type="button" variant="ghost" onClick={onRetry}>
            {t('retry')}
          </Button>
        </div>
      </div>
    );
  }

  if (!suggestions.length) {
    return null;
  }

  const multi = suggestions.length > 1;

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium text-sm">
            <Sparkles className="h-4 w-4" />
            {multi
              ? t('smart_multiple_suggestions')
              : t('smart_one_suggestion')}
          </div>
          <div className="text-muted-foreground text-xs">
            {multi
              ? t('smart_multiple_suggestions_description')
              : t('smart_one_suggestion_description')}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('smart_dismiss')}
          className="h-7 w-7 shrink-0"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-2">
        {suggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            creating={creatingSuggestionIds.includes(suggestion.id)}
            error={createErrors[suggestion.id]}
            multi={multi}
            selected={selectedSuggestionIds.includes(suggestion.id)}
            suggestion={suggestion}
            onApply={() => onApplySuggestion(suggestion)}
            onToggle={() => onToggleSuggestion(suggestion.id)}
          />
        ))}
      </div>

      {multi && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onApplyFirst}
          >
            <CheckCircle2 className="h-4 w-4" />
            {t('smart_apply_first')}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!selectedCount || isCreatingSelected}
            onClick={onCreateSelected}
          >
            {isCreatingSelected ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {t('smart_create_selected', { count: selectedCount })}
          </Button>
        </div>
      )}
    </div>
  );
}
