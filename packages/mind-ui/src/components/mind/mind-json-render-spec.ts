import { autoFixSpec, type Spec, type UIElement } from '@json-render/core';

type AnyRecord = Record<string, unknown>;
type AnyElement = UIElement<string, Record<string, unknown>>;
const TOP_LEVEL_PROP_KEYS = [
  'content',
  'description',
  'icon',
  'label',
  'subtitle',
  'text',
  'title',
  'trailing',
  'value',
  'variant',
] as const;

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
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    isRecord(value.props) &&
    Array.isArray(value.children)
  );
}

function isRenderUiSpec(value: unknown): value is Spec {
  if (!isRecord(value)) return false;
  if (typeof value.root !== 'string' || value.root.length === 0) return false;
  if (!isRecord(value.elements)) return false;

  return Object.values(value.elements).every(isUiElement);
}

function cleanRenderUiSpec(spec: Spec): Spec | null {
  const { spec: fixedSpec } = autoFixSpec(spec);
  if (!isRenderUiSpec(fixedSpec)) return null;

  const elementIds = new Set(Object.keys(fixedSpec.elements));
  const elements: Record<string, AnyElement> = {};

  for (const [id, element] of Object.entries(fixedSpec.elements)) {
    elements[id] = {
      ...element,
      children: (element.children ?? []).filter(
        (childId) => typeof childId === 'string' && elementIds.has(childId)
      ),
      props: normalizeElementProps(element),
    };
  }

  return fixedSpec.root in elements ? { ...fixedSpec, elements } : null;
}

function normalizeElementProps(element: AnyElement) {
  const props = isRecord(element.props) ? element.props : {};
  const normalized: AnyRecord = {};

  for (const key of TOP_LEVEL_PROP_KEYS) {
    const value = (element as unknown as AnyRecord)[key];
    if (props[key] === undefined && value !== undefined) {
      normalized[key] = value;
    }
  }

  return { ...normalized, ...props };
}

function getNestedCandidates(value: AnyRecord): unknown[] {
  const keys = ['spec', 'output', 'result', 'data', 'payload', 'json'];

  return keys
    .map((key) => value[key])
    .flatMap((candidate) => {
      if (typeof candidate === 'string') {
        const parsed = safeParseJson(candidate);
        return parsed ? [parsed] : [];
      }

      return candidate === undefined ? [] : [candidate];
    });
}

export function resolveMindRenderUiSpec(output: unknown): Spec | null {
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

    if (!isRecord(current) || visited.has(current)) continue;
    visited.add(current);

    if (isRenderUiSpec(current)) return cleanRenderUiSpec(current);
    queue.push(...getNestedCandidates(current));
  }

  return null;
}
