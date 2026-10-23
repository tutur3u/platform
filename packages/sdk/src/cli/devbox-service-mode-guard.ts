import { readFile } from 'node:fs/promises';
import type { DevboxExecutionMode } from './devbox-host-protection';

type ExistingMode = DevboxExecutionMode | 'unknown';

const MODE_LINE =
  /^\s*(?:export\s+)?TUTURUUU_DEVBOX_EXECUTION_MODE=['"]?([a-z-]+)['"]?\s*$/mu;

async function readExisting(path: string) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    // Missing files are new installs. Files this account cannot read cannot be
    // overwritten by it either (the write fails), so they need no guard here.
    return undefined;
  }
}

function modeFromScript(content: string): ExistingMode {
  const value = MODE_LINE.exec(content)?.[1];
  if (value === undefined) return 'trusted';
  return value === 'trusted' || value === 'judge-only' ? value : 'unknown';
}

// Units written by `installDevboxRunnerService` only carry the protected
// systemd hardening in judge-only mode.
function modeFromDefinition(content: string): ExistingMode | undefined {
  if (content.includes('[Service]'))
    return /^ProtectHome=yes$/mu.test(content) ? 'judge-only' : 'trusted';
  return undefined;
}

function wrapperFromDefinition(content: string) {
  return (
    /^ExecStart=(.+)$/mu.exec(content)?.[1]?.trim() ??
    /<key>ProgramArguments<\/key>\s*<array>\s*<string>([^<]+)<\/string>/u.exec(
      content
    )?.[1]
  );
}

// Installing a runner identity rewrites the token file, wrapper and service
// definition in place. When any of those already belongs to a runner with a
// different execution mode (for example a trusted runner on the legacy unit
// while a Judge runner is being added without --service-name), refuse unless
// the operator explicitly passes --force.
export async function assertRunnerExecutionModeUnchanged({
  executionMode,
  force,
  definitionPath,
  scriptPaths,
}: {
  executionMode: DevboxExecutionMode;
  force?: boolean;
  definitionPath?: string;
  scriptPaths: string[];
}) {
  if (force) return;
  const conflicts: string[] = [];
  const definition = definitionPath
    ? await readExisting(definitionPath)
    : undefined;
  const scripts = new Set(scriptPaths);
  if (definitionPath && definition !== undefined) {
    const mode = modeFromDefinition(definition);
    if (mode && mode !== executionMode)
      conflicts.push(`${definitionPath} (${mode})`);
    const wrapper = wrapperFromDefinition(definition);
    if (wrapper) scripts.add(wrapper);
  }
  for (const path of scripts) {
    const content = await readExisting(path);
    if (content === undefined) continue;
    const mode = modeFromScript(content);
    if (mode !== executionMode) conflicts.push(`${path} (${mode})`);
  }
  if (conflicts.length)
    throw new Error(
      `Refusing to replace runner files configured for a different execution mode than ${executionMode}: ${conflicts.join(', ')}. Use --service-name to install a separate runner identity, or pass --force to replace them.`
    );
}
