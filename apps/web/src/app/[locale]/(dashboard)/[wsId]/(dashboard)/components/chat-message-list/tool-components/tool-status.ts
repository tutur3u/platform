import { isObjectRecord } from '../helpers';
import type { ToolPartData } from '../types';

export function getToolPartStatus(part: ToolPartData) {
  const state = (part as { state?: string }).state ?? '';
  const output = (part as { output?: unknown }).output;
  const outputRecord = isObjectRecord(output) ? output : null;

  const isDone = state === 'output-available';
  const baseError = state === 'output-error' || state === 'output-denied';

  const logicalError =
    isDone &&
    (outputRecord?.success === false ||
      outputRecord?.ok === false ||
      outputRecord?.partialFailure === true ||
      (typeof outputRecord?.error === 'string' &&
        outputRecord.error.length > 0));

  const isError = baseError || logicalError;
  const isRunning = !isDone && !baseError;

  return { isDone, isError, isRunning, logicalError };
}
