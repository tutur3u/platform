import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type ChangedFilesResult,
  resolveChangedFiles,
} from './resolve-changed-files-core.ts';

type ParsedArgs = {
  eventName?: string;
  eventPath?: string;
  headSha?: string;
  outputDir?: string;
  refName?: string;
  rootDir: string;
  workflowName?: string;
};

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    rootDir: process.cwd(),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--event-name' && next) {
      parsed.eventName = next;
      index += 1;
      continue;
    }

    if (arg === '--event-path' && next) {
      parsed.eventPath = next;
      index += 1;
      continue;
    }

    if (arg === '--head-sha' && next) {
      parsed.headSha = next;
      index += 1;
      continue;
    }

    if (arg === '--output-dir' && next) {
      parsed.outputDir = next;
      index += 1;
      continue;
    }

    if (arg === '--ref-name' && next) {
      parsed.refName = next;
      index += 1;
      continue;
    }

    if (arg === '--root-dir' && next) {
      parsed.rootDir = next;
      index += 1;
      continue;
    }

    if (arg === '--workflow' && next) {
      parsed.workflowName = next;
      index += 1;
    }
  }

  return parsed;
}

function writeGithubOutput(output: Record<string, string>) {
  const githubOutput = process.env.GITHUB_OUTPUT;

  if (!githubOutput) {
    return;
  }

  appendFileSync(
    githubOutput,
    `${Object.entries(output)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`
  );
}

function writeChangedFiles({
  outputDir,
  result,
}: {
  outputDir: string;
  result: ChangedFilesResult;
}): string | null {
  if (!result.available) {
    return null;
  }

  mkdirSync(outputDir, { recursive: true });

  const filePath = join(outputDir, `changed-files-${process.pid}.txt`);
  writeFileSync(filePath, `${result.files.join('\n')}\n`);

  return filePath;
}

function printResult(
  result: ChangedFilesResult,
  changedFilesPath: string | null
) {
  console.log(`Changed-file source: ${result.source}`);
  console.log(`Base SHA: ${result.baseSha ?? '(none)'}`);
  console.log(`Head SHA: ${result.headSha ?? '(none)'}`);
  console.log(
    `Changed-file state: ${
      result.available ? `${result.files.length} path(s)` : 'unavailable'
    }`
  );

  if (result.reason) {
    console.log(`Reason: ${result.reason}`);
  }

  if (changedFilesPath) {
    console.log(`Changed files path: ${changedFilesPath}`);

    for (const filePath of result.files) {
      console.log(`- ${filePath}`);
    }
  } else {
    console.log('Changed files path: (unavailable)');
    console.log('Affected-workflow gating will default open.');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await resolveChangedFiles(args);
  const outputDir = args.outputDir ?? process.env.RUNNER_TEMP ?? tmpdir();
  const changedFilesPath = writeChangedFiles({ outputDir, result });

  printResult(result, changedFilesPath);
  writeGithubOutput({
    base_sha: result.baseSha ?? '',
    changed_file_count: String(result.available ? result.files.length : ''),
    changed_files_path: changedFilesPath ?? '',
    changed_files_source: result.source,
    head_sha: result.headSha ?? '',
  });
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
