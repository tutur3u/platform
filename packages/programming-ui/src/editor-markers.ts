import * as monaco from 'monaco-editor';
import { CHECK_MARKER_OWNER, type CheckMarker } from './code-diagnostics';

/** Where checked problems go, so the check hook can be tested without Monaco. */
export interface CheckMarkerSink {
  set: (roomKey: string, byPath: Map<string, CheckMarker[]>) => void;
  clear: (roomKey: string) => void;
}

/** The editor names each model `${roomKey}/${path}`; @monaco-editor/react parses it as the URI. */
export const modelUri = (roomKey: string, path: string) =>
  monaco.Uri.parse(`${roomKey}/${path}`);

// Markers for files whose model does not exist yet; applied when the editor opens them.
const pending = new Map<string, CheckMarker[]>();
const applied = new Map<string, Set<string>>();
let watching: monaco.IDisposable | undefined;

function apply(uri: string, markers: CheckMarker[]) {
  const model = monaco.editor.getModel(monaco.Uri.parse(uri));
  if (!model) return false;
  monaco.editor.setModelMarkers(model, CHECK_MARKER_OWNER, markers);
  return true;
}

export const monacoCheckMarkers: CheckMarkerSink = {
  set(roomKey, byPath) {
    watching ??= monaco.editor.onDidCreateModel((model) => {
      const key = model.uri.toString();
      const markers = pending.get(key);
      if (!markers) return;
      pending.delete(key);
      monaco.editor.setModelMarkers(model, CHECK_MARKER_OWNER, markers);
    });
    const room = applied.get(roomKey) ?? new Set<string>();
    applied.set(roomKey, room);
    for (const [path, markers] of byPath) {
      const uri = modelUri(roomKey, path).toString();
      room.add(uri);
      if (apply(uri, markers)) pending.delete(uri);
      else pending.set(uri, markers);
    }
  },
  clear(roomKey) {
    for (const uri of applied.get(roomKey) ?? []) {
      pending.delete(uri);
      apply(uri, []);
    }
    applied.delete(roomKey);
  },
};

/** Errors, warnings and infos from every owner on the room's files; hints are not problems. */
export function countProblems(roomKey: string, paths: string[]) {
  let count = 0;
  for (const path of paths)
    for (const marker of monaco.editor.getModelMarkers({
      resource: modelUri(roomKey, path),
    }))
      if (marker.severity >= monaco.MarkerSeverity.Info) count += 1;
  return count;
}

export const onMarkersChange = (listener: () => void) =>
  monaco.editor.onDidChangeMarkers(listener);

/**
 * TypeScript and JavaScript problems from Monaco's own worker, with the
 * bundled libs only (no type acquisition over the network). A playground runs
 * on Node without @types/node or installed packages, so the "cannot find
 * name or module" family stays quiet instead of flagging working code.
 */
const IGNORED_CODES = [
  2307, // Cannot find module
  2580, // Cannot find name 'require'/'process': install @types/node
  2591, // The same, asking to add node to `types`
  2792, // Cannot find module; try another moduleResolution
  7016, // No declaration file for a module
  80001, // File is a CommonJS module; may be converted to ES
];
let configured = false;
export function configureScriptDiagnostics(instance: typeof monaco) {
  if (configured) return;
  configured = true;
  const { typescript } = instance;
  const compilerOptions = {
    target: typescript.ScriptTarget.ESNext,
    module: typescript.ModuleKind.ESNext,
    moduleResolution: typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    allowJs: true,
    esModuleInterop: true,
    strict: true,
    noImplicitAny: false,
  };
  typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
  typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
  typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: IGNORED_CODES,
  });
  // JavaScript keeps syntax errors only; type errors in plain JS are noise.
  typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: IGNORED_CODES,
  });
}
