type Call = {
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  args?: unknown;
  output?: unknown;
};
type Step = { toolCalls?: Call[]; toolResults?: Call[] };
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])])
  );
}

function isReadOrUi(name: string) {
  return (
    /^(get_|list_|search_|recall$|check_|preview_)/.test(name) ||
    [
      'select_tools',
      'show_workspace_artifact',
      'manage_workspace',
      'set_sidebar',
      'set_theme',
      'set_immersive_mode',
      'no_action_needed',
    ].includes(name)
  );
}

/** Stop repeated discovery/read/UI cycles, while writes invalidate cached reads. */
export function getMiraToolLoopReason(steps: unknown[]): string | null {
  const successes = new Map<string, number>();
  const failures = new Map<string, number>();
  for (const value of steps) {
    if (!isObject(value)) continue;
    const step = value as Step;
    for (const result of step.toolResults ?? []) {
      const name = result.toolName;
      if (!name) continue;
      const call = step.toolCalls?.find((candidate) =>
        result.toolCallId
          ? candidate.toolCallId === result.toolCallId
          : candidate.toolName === name
      );
      const input = result.input ?? call?.input ?? call?.args ?? {};
      const signature = `${name}:${JSON.stringify(stableValue(input))}`;
      const output = result.output;
      if (isObject(output) && output.reusedResult === true)
        return `Repeated mutation prevented: ${name}`;
      const failed =
        isObject(output) &&
        (output.error || output.ok === false || output.success === false);
      if (failed) {
        const count = (failures.get(signature) ?? 0) + 1;
        failures.set(signature, count);
        if (count >= 3) return `Repeated failure: ${name}`;
      } else if (isReadOrUi(name)) {
        const count = (successes.get(signature) ?? 0) + 1;
        successes.set(signature, count);
        if (count >= 2) return `Repeated completed action: ${name}`;
      } else {
        // A successful product mutation can make previous reads stale.
        successes.clear();
        failures.clear();
      }
    }
  }
  return null;
}
