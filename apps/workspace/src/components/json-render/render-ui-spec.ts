import { autoFixSpec, type Spec, type UIElement } from '@json-render/core';

type AnyRecord = Record<string, unknown>;
type AnyElement = UIElement<string, Record<string, unknown>>;

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

function isUiElement(value: unknown): value is AnyElement {
  if (!isRecord(value)) return false;
  return (
    typeof value.type === 'string' &&
    isRecord(value.props) &&
    Array.isArray(value.children)
  );
}

function isRenderUiSpec(value: unknown): value is Spec {
  if (!isRecord(value)) return false;
  if (typeof value.root !== 'string' || value.root.length === 0) return false;
  if (!isRecord(value.elements)) return false;
  for (const element of Object.values(value.elements)) {
    if (!isUiElement(element)) return false;
  }
  return true;
}

function cleanRenderUiSpec(spec: Spec): Spec | null {
  const { spec: fixedSpec } = autoFixSpec(spec);
  if (!isRenderUiSpec(fixedSpec)) return null;

  const elementIds = new Set(Object.keys(fixedSpec.elements));
  const cleanedElements: Record<string, AnyElement> = {};

  for (const [id, element] of Object.entries(fixedSpec.elements)) {
    const children = Array.isArray(element.children)
      ? element.children.filter(
          (childId) => typeof childId === 'string' && elementIds.has(childId)
        )
      : [];

    cleanedElements[id] = {
      ...element,
      children,
    };
  }

  if (!(fixedSpec.root in cleanedElements)) return null;

  return {
    ...fixedSpec,
    elements: cleanedElements,
  };
}

function getNestedCandidates(value: AnyRecord): unknown[] {
  const candidates: unknown[] = [];
  const wrapperKeys = [
    'spec',
    'output',
    'result',
    'data',
    'payload',
    'json_schema',
    'schema',
  ];

  for (const key of wrapperKeys) {
    if (key in value) candidates.push(value[key]);
  }

  const jsonValue = value.json;
  if (typeof jsonValue === 'string') {
    const parsed = safeParseJson(jsonValue);
    if (parsed) candidates.push(parsed);
  } else if (jsonValue !== undefined) {
    candidates.push(jsonValue);
  }

  return candidates;
}

export function resolveRenderUiSpecFromOutput(output: unknown): Spec | null {
  const queue: unknown[] = [output];
  const visited = new WeakSet<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === null || current === undefined) continue;

    if (typeof current === 'string') {
      const parsed = safeParseJson(current);
      if (parsed) queue.push(parsed);
      continue;
    }

    if (!isRecord(current)) continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (isRenderUiSpec(current)) {
      return cleanRenderUiSpec(current);
    }

    queue.push(...getNestedCandidates(current));
  }

  return null;
}
