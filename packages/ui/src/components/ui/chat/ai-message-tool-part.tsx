'use client';

import { Renderer, VisibilityProvider } from '@json-render/react';
import { Check, ChevronRight, LoaderCircle, X } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { chatAiRegistry } from './ai-message-render-registry';
import {
  type AiMessagePart,
  formatJson,
  humanizeToolName,
  readString,
  readToolNameFromType,
  resolveRenderUiSpecFromOutput,
} from './ai-message-render-utils';

export type AiPartLabels = {
  completed: string;
  failed: string;
  input: string;
  output: string;
  running: string;
  thinking: string;
  thought: string;
};

export function ToolPart({
  labels,
  part,
}: {
  labels: AiPartLabels;
  part: AiMessagePart;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'output'>('output');
  const toolName =
    readString(part.toolName) ?? readToolNameFromType(part) ?? 'Tool';
  const state = readString(part.state);
  const output = part.output;
  const isRunning = state
    ? !['output-available', 'output-error'].includes(state)
    : output === undefined && !readString(part.errorText);
  const isError =
    state === 'output-error' ||
    Boolean(readString(part.errorText)) ||
    hasLogicalToolError(output);
  const spec =
    toolName === 'render_ui' ? resolveRenderUiSpecFromOutput(output) : null;
  const selectedTools = readSelectedTools(output);
  const hasInput = part.input !== undefined && part.input !== null;
  const hasOutput = output !== undefined || part.errorText !== undefined;
  const canExpand = hasInput || hasOutput;

  if (
    toolName === 'select_tools' &&
    !isRunning &&
    selectedTools.length === 1 &&
    (selectedTools[0] === 'google_search' ||
      selectedTools[0] === 'no_action_needed')
  ) {
    return null;
  }

  if (spec) {
    return (
      <div className="my-2 min-w-0 max-w-full">
        <div className="mb-1 flex items-center gap-1.5 text-xs">
          <Check className="size-3.5 text-dynamic-green" />
          <span className="font-medium">{humanizeToolName(toolName)}</span>
          <span className="text-muted-foreground">{labels.completed}</span>
        </div>
        <VisibilityProvider>
          <Renderer registry={chatAiRegistry} spec={spec as never} />
        </VisibilityProvider>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-md border bg-muted/20 text-xs',
        isError && 'border-dynamic-red/25 bg-dynamic-red/5'
      )}
    >
      <button
        className="flex w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left"
        onClick={() => canExpand && setExpanded((value) => !value)}
        type="button"
      >
        <ToolStatusIcon
          isError={Boolean(isError)}
          isRunning={Boolean(isRunning)}
        />
        <span className="min-w-0 truncate font-medium">
          {humanizeToolName(toolName)}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {isRunning
            ? labels.running
            : isError
              ? labels.failed
              : labels.completed}
        </span>
        {selectedTools.length > 0 && (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {selectedTools.map(humanizeToolName).join(', ')}
          </span>
        )}
        {canExpand && (
          <ChevronRight
            className={cn(
              'ml-auto size-3 shrink-0 text-muted-foreground transition-transform',
              expanded && 'rotate-90'
            )}
          />
        )}
      </button>
      {selectedTools.length > 0 && (
        <div className="flex flex-wrap gap-1 px-2.5 pb-1.5">
          {selectedTools.map((selectedTool) => (
            <span
              className="rounded-sm border bg-background px-1.5 py-0.5 text-muted-foreground"
              key={selectedTool}
            >
              {humanizeToolName(selectedTool)}
            </span>
          ))}
        </div>
      )}
      {expanded && canExpand && (
        <ToolDetails
          activeTab={activeTab}
          inputLabel={labels.input}
          inputValue={part.input}
          onTabChange={setActiveTab}
          outputLabel={labels.output}
          outputValue={output ?? part.errorText}
        />
      )}
    </div>
  );
}

function readSelectedTools(output: unknown) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return [];
  }

  const selectedTools = (output as { selectedTools?: unknown }).selectedTools;
  return Array.isArray(selectedTools)
    ? selectedTools.filter(
        (tool): tool is string => typeof tool === 'string' && tool.trim() !== ''
      )
    : [];
}

function ToolStatusIcon({
  isError,
  isRunning,
}: {
  isError: boolean;
  isRunning: boolean;
}) {
  if (isRunning) {
    return (
      <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
    );
  }
  if (isError) return <X className="size-3.5 text-dynamic-red" />;
  return <Check className="size-3.5 text-dynamic-green" />;
}

function ToolDetails({
  activeTab,
  inputLabel,
  inputValue,
  onTabChange,
  outputLabel,
  outputValue,
}: {
  activeTab: 'input' | 'output';
  inputLabel: string;
  inputValue: unknown;
  onTabChange: (tab: 'input' | 'output') => void;
  outputLabel: string;
  outputValue: unknown;
}) {
  const hasInput = inputValue !== undefined && inputValue !== null;
  const hasOutput = outputValue !== undefined && outputValue !== null;
  const visibleTab =
    activeTab === 'input' && hasInput
      ? 'input'
      : hasOutput
        ? 'output'
        : 'input';
  const visibleValue = visibleTab === 'input' ? inputValue : outputValue;

  return (
    <div className="border-t p-2 pt-1.5">
      <div className="mb-1.5 flex w-fit rounded-md border bg-background p-0.5">
        <ToolDetailTab
          disabled={!hasInput}
          label={inputLabel}
          onClick={() => onTabChange('input')}
          selected={visibleTab === 'input'}
        />
        <ToolDetailTab
          disabled={!hasOutput}
          label={outputLabel}
          onClick={() => onTabChange('output')}
          selected={visibleTab === 'output'}
        />
      </div>
      {visibleValue !== undefined && visibleValue !== null && (
        <pre className="max-h-48 select-text overflow-auto whitespace-pre-wrap rounded-md bg-background p-2 font-mono text-[11px] leading-5">
          <code>{formatJson(visibleValue)}</code>
        </pre>
      )}
    </div>
  );
}

function ToolDetailTab({
  disabled,
  label,
  onClick,
  selected,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <button
      className={cn(
        'rounded px-2 py-0.5 font-medium text-[11px]',
        selected ? 'bg-muted text-foreground' : 'text-muted-foreground',
        disabled && 'cursor-not-allowed opacity-40'
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function hasLogicalToolError(output: unknown) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return false;
  }

  const record = output as Record<string, unknown>;
  return (
    record.ok === false ||
    record.success === false ||
    typeof record.error === 'string'
  );
}
