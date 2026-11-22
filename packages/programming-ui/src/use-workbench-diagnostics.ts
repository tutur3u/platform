import type { PlaygroundLanguage } from '@tuturuuu/types/primitives/playgrounds';
import { useCallback, useSyncExternalStore } from 'react';
import {
  type CheckFiles,
  type DiagnosticsStatus,
  diagnosticsProvider,
  type WorkbenchCheck,
} from './code-diagnostics';
import {
  countProblems,
  monacoCheckMarkers,
  onMarkersChange,
} from './editor-markers';
import { useRemoteDiagnostics } from './use-remote-diagnostics';

/** Problems Monaco's TypeScript worker reported on the room's files. */
function useScriptProblems(roomKey: string, files: CheckFiles, on: boolean) {
  const paths = files.map((file) => file.path).join('\n');
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!on) return () => undefined;
      const listener = onMarkersChange(onChange);
      return () => listener.dispose();
    },
    [on]
  );
  return useSyncExternalStore(
    subscribe,
    () => (on && paths ? countProblems(roomKey, paths.split('\n')) : 0),
    () => 0
  );
}

/** The editor footer's problem status for the room's language; meetings only. */
export function useWorkbenchDiagnostics({
  roomKey,
  language,
  files,
  check,
  enabled,
  localEdits,
}: {
  roomKey: string;
  language: PlaygroundLanguage | undefined;
  files: CheckFiles;
  check?: WorkbenchCheck;
  enabled: boolean;
  localEdits?: (onEdit: () => void) => () => void;
}): DiagnosticsStatus {
  const provider = enabled ? diagnosticsProvider(language, !!check) : null;
  const script = useScriptProblems(roomKey, files, provider === 'script');
  const remote = useRemoteDiagnostics({
    roomKey,
    language,
    files,
    check,
    sink: monacoCheckMarkers,
    enabled: provider === 'remote',
    localEdits,
  });
  return provider === 'script' ? { kind: 'ready', problems: script } : remote;
}
