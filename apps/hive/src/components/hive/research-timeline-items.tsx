import {
  Bot,
  Clock,
  GitBranch,
  MessageSquareText,
  Sparkles,
} from '@tuturuuu/icons';
import type { HiveTimelineItem } from '@tuturuuu/internal-api/hive';

function asText(value: unknown) {
  return typeof value === 'string' ? value : null;
}

export function formatTimelineTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

export function getTimelineItemTitle(
  item: HiveTimelineItem,
  unknownNpc: string
) {
  if (item.kind === 'event') return item.eventType;
  if (item.kind === 'session_event') return item.eventKind;
  if (item.kind === 'simulation_tick') return item.status;
  if (item.kind === 'workflow_run') return item.workflowName ?? item.workflowId;
  if (item.kind === 'interaction') {
    const firstRun = item.runs[0];
    return (
      asText(firstRun?.outputDecision.conversationSummary) ??
      `${item.npcName ?? unknownNpc} -> ${item.targetNpcName ?? unknownNpc}`
    );
  }
  return (
    asText(item.outputDecision.spokenText) ??
    asText(item.outputDecision.conversationSummary) ??
    item.promptMode
  );
}

export function getTimelineIcon(item: HiveTimelineItem) {
  if (item.kind === 'event') return Clock;
  if (item.kind === 'workflow_run') return GitBranch;
  if (item.kind === 'simulation_tick') return Sparkles;
  if (item.kind === 'session_event') return MessageSquareText;
  return item.autonomous ? Sparkles : Bot;
}

export function getTimelineItemDetails(item: HiveTimelineItem) {
  if (item.kind === 'interaction') {
    return {
      input: item.runs[0]?.inputContext ?? {},
      output: item.runs.map((run) => run.outputDecision),
    };
  }
  if (item.kind === 'run') {
    return { input: item.inputContext, output: item.outputDecision };
  }
  if (item.kind === 'workflow_run') {
    return { input: item.input, output: item.output };
  }
  if (item.kind === 'simulation_tick') {
    return { input: {}, output: item.summary };
  }
  return { input: {}, output: 'payload' in item ? item.payload : {} };
}
