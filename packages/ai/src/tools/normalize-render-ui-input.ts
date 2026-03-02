import { hasToolCallInSteps } from '../chat/mira-render-ui-policy';

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeElement(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;

  const element: AnyRecord = { ...raw };
  const rawProps = element.props;
  const props = isRecord(rawProps) ? { ...rawProps } : {};

  // Common model mistake: put bindings under props.bindings instead of element.bindings.
  if (!element.bindings && isRecord(props.bindings)) {
    element.bindings = props.bindings;
    delete props.bindings;
  }

  element.props = props;
  element.children = Array.isArray(element.children) ? element.children : [];

  return element;
}

function normalizeSpecLike(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  if (typeof raw.root !== 'string' || !isRecord(raw.elements)) return raw;

  const normalizedElements: AnyRecord = {};
  for (const [id, element] of Object.entries(raw.elements)) {
    normalizedElements[id] = normalizeElement(element);
  }

  return {
    ...raw,
    elements: normalizedElements,
  };
}

function getCandidates(value: AnyRecord): unknown[] {
  const candidates: unknown[] = [];
  const keys = [
    'json_schema',
    'spec',
    'schema',
    'output',
    'result',
    'data',
    'payload',
  ];

  for (const key of keys) {
    if (key in value) candidates.push(value[key]);
  }

  if (typeof value.json === 'string') {
    const parsed = safeParseJson(value.json);
    if (parsed !== null) candidates.push(parsed);
  } else if (value.json !== undefined) {
    candidates.push(value.json);
  }

  return candidates;
}

/**
 * Detect whether a normalized spec-like value has an empty `elements` record.
 */
function hasEmptyElements(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.root !== 'string') return false;
  if (!isRecord(value.elements)) return false;
  return Object.keys(value.elements).length === 0;
}

/**
 * Mapping from data-fetching tool names to smart fallback UI specs.
 * Each entry returns `{ root, elements }` that can be merged onto the spec.
 */
function buildContextAwareFallback(
  steps: unknown[]
): { root: string; elements: AnyRecord } | null {
  // Priority order: tasks > time-tracking > calendar > finance
  const taskTools = ['get_my_tasks', 'create_task', 'update_task'];
  const timeTools = [
    'start_timer',
    'stop_timer',
    'list_time_tracking_sessions',
    'get_time_tracking_session',
    'create_time_tracking_entry',
  ];
  const calendarTools = [
    'get_upcoming_events',
    'create_calendar_event',
    'update_calendar_event',
  ];
  const financeTools = [
    'get_spending_summary',
    'list_transactions',
    'create_transaction',
  ];

  const hasAnyToolCall = (toolNames: string[]) =>
    toolNames.some((name) => hasToolCallInSteps(steps, name));

  if (hasAnyToolCall(taskTools)) {
    return {
      root: 'auto_tasks',
      elements: {
        auto_tasks: {
          type: 'MyTasks',
          props: { showSummary: true, showFilters: true },
          children: [],
        },
      },
    };
  }

  if (hasAnyToolCall(timeTools)) {
    return {
      root: 'auto_time',
      elements: {
        auto_time: {
          type: 'TimeTrackingStats',
          props: { period: 'last_7_days' },
          children: [],
        },
      },
    };
  }

  if (hasAnyToolCall(calendarTools)) {
    return {
      root: 'auto_calendar',
      elements: {
        auto_calendar: {
          type: 'Card',
          props: { title: 'Upcoming Events' },
          children: ['auto_calendar_text'],
        },
        auto_calendar_text: {
          type: 'Text',
          props: {
            content:
              'Your upcoming events are shown above. Ask me to create, update, or check specific events.',
          },
          children: [],
        },
      },
    };
  }

  if (hasAnyToolCall(financeTools)) {
    return {
      root: 'auto_finance',
      elements: {
        auto_finance: {
          type: 'Card',
          props: { title: 'Finance Summary' },
          children: ['auto_finance_text'],
        },
        auto_finance_text: {
          type: 'Text',
          props: {
            content:
              'Your finance data is shown above. Ask me for more details or to manage transactions.',
          },
          children: [],
        },
      },
    };
  }

  return null;
}

/**
 * Build a minimal valid spec so the model output passes Zod validation.
 * Uses context from previous tool calls when available, otherwise falls back
 * to a generic Callout.
 */
function autoPopulateEmptyElements(
  value: AnyRecord,
  steps: unknown[]
): AnyRecord {
  const contextFallback = buildContextAwareFallback(steps);
  if (contextFallback) {
    return {
      ...value,
      root: contextFallback.root,
      elements: contextFallback.elements,
    };
  }

  // Generic fallback when no data tools were called.
  const root =
    typeof value.root === 'string' && value.root.trim().length > 0
      ? value.root.trim()
      : 'auto_root';

  return {
    ...value,
    root,
    elements: {
      [root]: {
        type: 'Callout',
        props: {
          title: 'UI unavailable',
          variant: 'warning',
          content:
            'The assistant attempted to render interactive UI but the specification was incomplete. Please try your request again.',
        },
        children: [],
      },
    },
  };
}

/**
 * Normalize model-generated render_ui inputs before zod validation.
 * Handles common wrappers and structural mistakes while preserving unknown fields.
 */
export function normalizeRenderUiInputForTool(input: unknown): unknown {
  const queue: unknown[] = [input];
  const visited = new WeakSet<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === null || current === undefined) continue;

    if (typeof current === 'string') {
      const parsed = safeParseJson(current);
      if (parsed !== null) {
        queue.push(parsed);
      }
      continue;
    }

    if (!isRecord(current)) continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const normalized = normalizeSpecLike(current);
    if (normalized !== current) return normalized;

    queue.push(...getCandidates(current));
  }

  return input;
}

/**
 * Create a stateful preprocessor for render_ui that tracks empty-elements
 * attempts per stream.
 *
 * When the model sends empty `elements`, the preprocessor immediately
 * auto-populates a context-aware fallback (using data tools found in
 * previous steps) on the **first** empty-elements call. Waiting for a
 * Zod rejection first is proven to be wasteful — the model never
 * self-corrects after rejection.
 *
 * @param getSteps – Optional callback returning the current steps array.
 *   When provided, the auto-populated fallback is context-aware (e.g.
 *   MyTasks when get_my_tasks was called). When omitted, falls back to a
 *   generic Callout.
 *
 * Returns an object with the preprocessor function and a `wasAutoPopulated()`
 * check that the execute handler can call to detect auto-populated specs.
 */
export function createRenderUiPreprocessor(getSteps?: () => unknown[]): {
  preprocess: (val: unknown) => unknown;
  wasAutoPopulated: () => boolean;
} {
  let emptyElementsAttempts = 0;
  let lastCallAutoPopulated = false;

  return {
    preprocess(val: unknown): unknown {
      lastCallAutoPopulated = false;
      const normalized = normalizeRenderUiInputForTool(val);

      if (hasEmptyElements(normalized)) {
        emptyElementsAttempts += 1;

        // Auto-populate on the first empty-elements call. The model never
        // self-corrects after Zod rejection, so the first rejection just
        // wastes a step and tokens.
        if (emptyElementsAttempts === 1) {
          lastCallAutoPopulated = true;
          const steps = getSteps?.() ?? [];
          return autoPopulateEmptyElements(normalized as AnyRecord, steps);
        }
      }

      return normalized;
    },
    wasAutoPopulated(): boolean {
      return lastCallAutoPopulated;
    },
  };
}
