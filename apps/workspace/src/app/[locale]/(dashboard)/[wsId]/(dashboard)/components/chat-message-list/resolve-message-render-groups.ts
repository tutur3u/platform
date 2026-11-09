import type { UIMessage } from 'ai';
import { resolveRenderUiSpecFromOutput } from '@/components/json-render/render-ui-spec';
import { groupMessageParts } from './group-message-parts';
import { hasOutputText } from './helpers';
import type { ToolPartData } from './types';

interface RenderUiOutput {
  recoveredFromInvalidSpec?: boolean;
  autoRecoveredFromInvalidSpec?: boolean;
  forcedFromRecoveryLoop?: boolean;
  autoPopulatedFallback?: boolean;
}

export function isRecoveredOutput(output: unknown): boolean {
  if (!output || typeof output !== 'object') return false;
  const parsed = output as RenderUiOutput;
  // Auto-populated fallbacks contain valid renderable UI injected by the
  // preprocessor (e.g. MyTasks, TimeTrackingStats, or a generic Callout).
  // They should be rendered as normal UI, not treated as failures.
  if (parsed.autoPopulatedFallback === true) return false;
  return (
    parsed.recoveredFromInvalidSpec === true ||
    parsed.autoRecoveredFromInvalidSpec === true ||
    parsed.forcedFromRecoveryLoop === true
  );
}

type SourceUrlPart = {
  type: 'source-url';
  url: string;
  title?: string;
  sourceId: string;
};

function getStablePartKey(part: ToolPartData, fallbackIndex: number): string {
  const maybeId = (part as { id?: unknown; key?: unknown }).id;
  if (typeof maybeId === 'string' && maybeId.trim().length > 0) {
    return maybeId.trim();
  }

  const maybeKey = (part as { id?: unknown; key?: unknown }).key;
  if (typeof maybeKey === 'string' && maybeKey.trim().length > 0) {
    return maybeKey.trim();
  }

  try {
    return JSON.stringify(part);
  } catch {
    return `fallback-${fallbackIndex}`;
  }
}

export type RenderUiFailureMeta = {
  /** Total render_ui attempts that failed (recovered) in this group. */
  attemptCount: number;
  /** Whether the model was forcibly stopped from a recovery loop. */
  forcedStop: boolean;
};

export type MessageRenderDescriptor =
  | {
      kind: 'reasoning';
      key: string;
      text: string;
      isAnimating: boolean;
    }
  | {
      kind: 'text';
      key: string;
      text: string;
      isAnimating: boolean;
    }
  | {
      kind: 'tool';
      key: string;
      part: ToolPartData;
      /** Present only for render_ui parts that failed after recovery attempts. */
      renderUiFailure?: RenderUiFailureMeta;
    }
  | {
      kind: 'tool-group';
      key: string;
      toolName: string;
      parts: ToolPartData[];
    }
  | {
      kind: 'sources';
      key: string;
      parts: SourceUrlPart[];
    };

function computeVisibleParts(
  partsWithValidity: Array<{
    part: ToolPartData;
    hasRenderableSpec: boolean;
    recoveredFromInvalidSpec: boolean;
  }>,
  fallbackParts: ToolPartData[]
): ToolPartData[] {
  const nonRecoveredRenderableParts = partsWithValidity
    .filter(
      (entry) => entry.hasRenderableSpec && !entry.recoveredFromInvalidSpec
    )
    .slice(-1)
    .map((entry) => entry.part);

  if (nonRecoveredRenderableParts.length > 0) {
    return nonRecoveredRenderableParts;
  }

  const anyRenderableParts = partsWithValidity
    .filter((entry) => entry.hasRenderableSpec)
    .slice(-1)
    .map((entry) => entry.part);

  if (anyRenderableParts.length > 0) {
    return anyRenderableParts;
  }

  return fallbackParts;
}

export function resolveMessageRenderGroups({
  message,
  isStreaming,
  isLastAssistant,
}: {
  message: UIMessage;
  isStreaming: boolean;
  isLastAssistant: boolean;
}): MessageRenderDescriptor[] {
  const groups = groupMessageParts(message.parts);
  const renderUiAnalysis = new WeakMap<
    object,
    {
      spec: ReturnType<typeof resolveRenderUiSpecFromOutput>;
      recovered: boolean;
    }
  >();
  const getRenderUiPartAnalysis = (part: ToolPartData) => {
    const cacheKey = part as unknown as object;
    const cached = renderUiAnalysis.get(cacheKey);
    if (cached) {
      return cached;
    }

    const output = (part as { output?: unknown }).output;
    const analyzed = {
      spec: resolveRenderUiSpecFromOutput(output),
      recovered: isRecoveredOutput(output),
    };
    renderUiAnalysis.set(cacheKey, analyzed);
    return analyzed;
  };

  const validRenderUiSpecs = groups.flatMap((group) => {
    if (group.kind !== 'tool' || group.toolName !== 'render_ui') {
      return [];
    }
    return group.parts
      .map((part) => {
        const { spec, recovered } = getRenderUiPartAnalysis(part);
        return spec && !recovered ? spec : null;
      })
      .filter((spec): spec is NonNullable<typeof spec> => spec !== null);
  });
  const hasValidRenderUi = validRenderUiSpecs.length > 0;
  const lastReasoningIdx = groups.findLastIndex((g) => g.kind === 'reasoning');
  const descriptors: MessageRenderDescriptor[] = [];

  for (const [gi, group] of groups.entries()) {
    switch (group.kind) {
      case 'reasoning': {
        const isLatestReasoning = gi === lastReasoningIdx;
        const isReasoningInProgress =
          isLatestReasoning &&
          isStreaming &&
          isLastAssistant &&
          !hasOutputText(message);

        descriptors.push({
          kind: 'reasoning',
          key: `reasoning-${group.index}`,
          text:
            typeof group.text === 'string'
              ? group.text
              : JSON.stringify(group.text),
          isAnimating: isReasoningInProgress,
        });
        break;
      }
      case 'text': {
        descriptors.push({
          kind: 'text',
          key: `text-${group.index}`,
          text:
            typeof group.text === 'string'
              ? group.text
              : JSON.stringify(group.text),
          isAnimating: isStreaming && isLastAssistant,
        });
        break;
      }
      case 'tool': {
        if (group.toolName === 'render_ui') {
          const partsWithValidity = group.parts.map((part) => {
            const { spec, recovered } = getRenderUiPartAnalysis(part);
            return {
              part,
              hasRenderableSpec: !!spec,
              recoveredFromInvalidSpec: recovered,
            };
          });
          const hasRecoveredRenderable = partsWithValidity.some(
            (entry) => entry.hasRenderableSpec && entry.recoveredFromInvalidSpec
          );
          const hasNonRecoveredRenderable = partsWithValidity.some(
            (entry) =>
              entry.hasRenderableSpec && !entry.recoveredFromInvalidSpec
          );
          const shouldDeferRecoveredPlaceholder =
            hasRecoveredRenderable &&
            !hasNonRecoveredRenderable &&
            isStreaming &&
            isLastAssistant;

          const visibleParts = computeVisibleParts(
            partsWithValidity,
            group.parts
          );

          if (
            hasValidRenderUi &&
            visibleParts.every(
              (part) => getRenderUiPartAnalysis(part).recovered
            )
          ) {
            break;
          }

          if (shouldDeferRecoveredPlaceholder && visibleParts.length > 0) {
            break;
          }

          // Compute failure metadata for recovered render_ui groups.
          const allRecovered =
            visibleParts.length > 0 &&
            visibleParts.every(
              (part) => getRenderUiPartAnalysis(part).recovered
            );
          const recoveredAttemptCount = partsWithValidity.filter(
            (e) => e.recoveredFromInvalidSpec
          ).length;
          const hasForcedStop = partsWithValidity.some((e) => {
            const output = (e.part as { output?: unknown }).output;
            return (
              isRecoveredOutput(output) &&
              typeof output === 'object' &&
              output !== null &&
              (output as Record<string, unknown>).forcedFromRecoveryLoop ===
                true
            );
          });

          const failureMeta: RenderUiFailureMeta | undefined = allRecovered
            ? {
                attemptCount: recoveredAttemptCount,
                forcedStop: hasForcedStop,
              }
            : undefined;

          visibleParts.forEach((part, idx) => {
            descriptors.push({
              kind: 'tool',
              key: `render-ui-${group.startIndex}-${getStablePartKey(part, idx)}`,
              part,
              renderUiFailure: failureMeta,
            });
          });
          break;
        }

        if (group.parts.length === 1) {
          descriptors.push({
            kind: 'tool',
            key: `tool-${group.startIndex}`,
            part: group.parts[0]!,
          });
          break;
        }

        descriptors.push({
          kind: 'tool-group',
          key: `toolgroup-${group.startIndex}`,
          toolName: group.toolName,
          parts: group.parts,
        });
        break;
      }
      default:
        break;
    }
  }

  const sourceParts = (message.parts ?? []).filter(
    (p): p is SourceUrlPart =>
      !!p &&
      typeof p === 'object' &&
      p.type === 'source-url' &&
      typeof p.url === 'string' &&
      p.url.trim().length > 0 &&
      typeof p.sourceId === 'string' &&
      p.sourceId.trim().length > 0
  );

  if (sourceParts.length > 0) {
    descriptors.push({
      kind: 'sources',
      key: 'sources',
      parts: sourceParts,
    });
  }

  return descriptors;
}
