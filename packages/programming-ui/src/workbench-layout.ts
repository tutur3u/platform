import type { PlaygroundExecutionResult } from '@tuturuuu/types/primitives/playgrounds';

/** Pure layout decisions for the workbench, kept free of React for unit tests. */
export const ACTIVE_RUN_STATUSES = ['queued', 'running', 'cancel_requested'];
const FILE_PATH = /^[a-zA-Z0-9_.@+-]+(?:\/[a-zA-Z0-9_.@+-]+)*$/;

export type NewFileError = 'invalid' | 'duplicate';
export function newFilePathError(
  path: string,
  existing: readonly string[]
): NewFileError | null {
  const value = path.trim();
  if (
    !FILE_PATH.test(value) ||
    value.split('/').some((part) => part === '..' || part === '.')
  )
    return 'invalid';
  return existing.includes(value) ? 'duplicate' : null;
}

export function previewPort(value: string): number | null {
  if (!/^\d{4,5}$/.test(value.trim())) return null;
  const port = Number(value);
  return port >= 1024 && port <= 65535 ? port : null;
}

export function isRunActive(status: string | undefined) {
  return !!status && ACTIVE_RUN_STATUSES.includes(status);
}

export type SaveState = 'failed' | 'saved' | 'idle';
export function saveState(saveError: boolean, savedRevision: number | null) {
  return saveError ? 'failed' : savedRevision !== null ? 'saved' : 'idle';
}

export interface OutputView {
  text: string;
  exitCode: number | null;
  running: boolean;
}
/** The output pane shows real run text or an explicit empty state, never a stale frame. */
export function outputView(
  problem: boolean,
  testOutput: string,
  result: PlaygroundExecutionResult | undefined
): OutputView {
  if (problem) return { text: testOutput, exitCode: null, running: false };
  const running = isRunActive(result?.status);
  return {
    text: result?.output ?? '',
    exitCode: running || result?.exitCode == null ? null : result.exitCode,
    running,
  };
}

export interface WorkbenchAction {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}
