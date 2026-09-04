#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const COORDINATION_DIR_RELATIVE_PATH = 'tmp/agent-coordination';
const CANONICAL_STATUSES = new Set(['working', 'blocked', 'handoff', 'done']);
const REQUIRED_FIELDS = [
  'Agent',
  'Intent',
  'Owned paths',
  'Observed dirty paths',
  'Status',
  'Needs',
  'Verification',
  'Risks',
  'Commit window',
];
const DIAGNOSTIC_CODES = [
  'read_error',
  'missing_field',
  'duplicate_field',
  'noncanonical_status',
  'malformed_owned_paths',
  'done_at_top_level',
];
const STRICT_EXIT_CODE = 2;
const ERROR_EXIT_CODE = 1;

const USAGE = `Usage: bun coordination:audit [--json] [--strict]

Audits top-level tmp/agent-coordination/*.md notes without changing them.
Default mode reports existing lifecycle debt and exits zero. --strict exits
nonzero when any lifecycle diagnostic is present.`;

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function normalizeRelativePath(relativePath) {
  return String(relativePath).replaceAll('\\', '/').replace(/^\.\//u, '');
}

function parseFieldLine(line) {
  const boldMatch = line.match(
    /^\s*-\s+\*\*([A-Za-z][A-Za-z ]*):\*\*\s*(.*?)\s*$/u
  );
  const plainMatch = line.match(/^\s*([A-Za-z][A-Za-z ]*):\s*(.*?)\s*$/u);
  const match = boldMatch ?? plainMatch;

  if (!match) return null;

  const field = match[1].replace(/\s+/gu, ' ').trim();
  if (!REQUIRED_FIELDS.includes(field)) return null;

  return { field, value: match[2].trim() };
}

function createDiagnostic(relativePath, code, field = null) {
  return { path: normalizeRelativePath(relativePath), code, field };
}

function hasOwnedPathEntry(lines, fieldLineIndex, inlineValue) {
  if (inlineValue) return true;

  for (let index = fieldLineIndex + 1; index < lines.length; index += 1) {
    if (parseFieldLine(lines[index])) return false;
    if (/^\s*#{1,6}\s/u.test(lines[index])) return false;
    if (/^\s*-\s+\S/u.test(lines[index])) return true;
    if (lines[index].trim()) return false;
  }

  return false;
}

function isTopLevelCoordinationNote(relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  return path.posix.dirname(normalizedPath) === COORDINATION_DIR_RELATIVE_PATH;
}

function parseCoordinationNote(text, relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const lines = String(text).split(/\r?\n/u);
  const occurrences = new Map(REQUIRED_FIELDS.map((field) => [field, []]));

  lines.forEach((line, index) => {
    const parsed = parseFieldLine(line);
    if (parsed) occurrences.get(parsed.field).push({ ...parsed, line: index });
  });

  const diagnostics = [];
  for (const field of REQUIRED_FIELDS) {
    const entries = occurrences.get(field);
    if (entries.length === 0) {
      diagnostics.push(
        createDiagnostic(normalizedPath, 'missing_field', field)
      );
    } else if (entries.length > 1) {
      diagnostics.push(
        createDiagnostic(normalizedPath, 'duplicate_field', field)
      );
    }
  }

  const statusEntries = occurrences.get('Status');
  if (statusEntries.length === 1) {
    const status = statusEntries[0].value.replace(/\s+/gu, ' ').trim();
    if (!CANONICAL_STATUSES.has(status)) {
      diagnostics.push(
        createDiagnostic(normalizedPath, 'noncanonical_status', 'Status')
      );
    } else if (
      status === 'done' &&
      isTopLevelCoordinationNote(normalizedPath)
    ) {
      diagnostics.push(
        createDiagnostic(normalizedPath, 'done_at_top_level', 'Status')
      );
    }
  }

  const ownedPathEntries = occurrences.get('Owned paths');
  if (
    ownedPathEntries.length === 1 &&
    !hasOwnedPathEntry(
      lines,
      ownedPathEntries[0].line,
      ownedPathEntries[0].value
    )
  ) {
    diagnostics.push(
      createDiagnostic(normalizedPath, 'malformed_owned_paths', 'Owned paths')
    );
  }

  return {
    path: normalizedPath,
    diagnostics: sortDiagnostics(diagnostics),
  };
}

function sortDiagnostics(diagnostics) {
  return [...diagnostics].sort((left, right) => {
    const pathOrder = left.path.localeCompare(right.path);
    if (pathOrder !== 0) return pathOrder;
    const codeOrder =
      DIAGNOSTIC_CODES.indexOf(left.code) -
      DIAGNOSTIC_CODES.indexOf(right.code);
    if (codeOrder !== 0) return codeOrder;
    return String(left.field ?? '').localeCompare(String(right.field ?? ''));
  });
}

function auditCoordinationNotes({ rootDir = ROOT_DIR, fsImpl = fs } = {}) {
  const coordinationDir = path.join(rootDir, COORDINATION_DIR_RELATIVE_PATH);
  let entries;

  try {
    entries = fsImpl.readdirSync(coordinationDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') entries = [];
    else throw error;
  }

  const noteNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const files = noteNames.map((name) => {
    const relativePath = path.posix.join(COORDINATION_DIR_RELATIVE_PATH, name);
    try {
      const text = fsImpl.readFileSync(
        path.join(coordinationDir, name),
        'utf8'
      );
      return parseCoordinationNote(text, relativePath);
    } catch {
      return {
        path: relativePath,
        diagnostics: [createDiagnostic(relativePath, 'read_error')],
      };
    }
  });

  const diagnostics = sortDiagnostics(
    files.flatMap((file) => file.diagnostics)
  );
  const byCode = Object.fromEntries(
    DIAGNOSTIC_CODES.map((code) => [
      code,
      diagnostics.filter((diagnostic) => diagnostic.code === code).length,
    ])
  );

  return {
    version: 1,
    scannedFiles: files.length,
    filesWithDiagnostics: files.filter((file) => file.diagnostics.length > 0)
      .length,
    diagnosticCount: diagnostics.length,
    byCode,
    files,
  };
}

function parseArgs(argv) {
  const options = { json: false, strict: false };
  const args = [...argv];

  if (args[0] === 'audit') args.shift();
  for (const arg of args) {
    if (arg === '--json') options.json = true;
    else if (arg === '--strict') options.strict = true;
    else throw new UsageError(`Unknown option: ${arg}`);
  }

  return options;
}

function formatHumanReport(report) {
  const lines = [
    `Coordination notes audit: ${report.scannedFiles} file(s), ${report.filesWithDiagnostics} file(s) with diagnostics, ${report.diagnosticCount} diagnostic(s).`,
  ];

  for (const file of report.files.filter(
    (entry) => entry.diagnostics.length > 0
  )) {
    const details = file.diagnostics
      .map((diagnostic) => {
        const field = diagnostic.field ? ` (${diagnostic.field})` : '';
        return `${diagnostic.code}${field}`;
      })
      .join(', ');
    lines.push(`${file.path}: ${details}`);
  }

  if (report.diagnosticCount === 0) {
    lines.push('No lifecycle diagnostics found.');
  }

  return `${lines.join('\n')}\n`;
}

function runCli(
  argv,
  {
    rootDir = ROOT_DIR,
    fsImpl = fs,
    stdout = (value) => process.stdout.write(value),
    stderr = (value) => process.stderr.write(value),
  } = {}
) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    stderr(`${error.message}\n${USAGE}\n`);
    return ERROR_EXIT_CODE;
  }

  let report;
  try {
    report = auditCoordinationNotes({ rootDir, fsImpl });
  } catch {
    stderr('Unable to scan the coordination-note directory.\n');
    return ERROR_EXIT_CODE;
  }

  stdout(
    options.json
      ? `${JSON.stringify(report, null, 2)}\n`
      : formatHumanReport(report)
  );
  return options.strict && report.diagnosticCount > 0 ? STRICT_EXIT_CODE : 0;
}

if (require.main === module) {
  process.exitCode = runCli(process.argv.slice(2));
}

module.exports = {
  CANONICAL_STATUSES,
  COORDINATION_DIR_RELATIVE_PATH,
  DIAGNOSTIC_CODES,
  REQUIRED_FIELDS,
  STRICT_EXIT_CODE,
  UsageError,
  auditCoordinationNotes,
  formatHumanReport,
  parseArgs,
  parseCoordinationNote,
  parseFieldLine,
  runCli,
};
