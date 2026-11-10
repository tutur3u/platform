import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Workflow creation is separate from affected-gate. Path filters decide
// whether GitHub queues the run. The gate can only skip jobs after that.
// Security workflows stay selectable for every non-ignored source file.
const WORKFLOWS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.github/workflows'
);

const SECURITY_WORKFLOWS = ['codeql.yml', 'security-checks.yaml'];

function parseFlow(text) {
  const inner = text.slice(text.indexOf('[') + 1, text.lastIndexOf(']'));
  const items = [];
  let current = '';
  let quote = '';
  for (const char of inner) {
    if (quote) {
      current += char;
      if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ',') {
      const item = current.trim().replace(/^['"]|['"]$/gu, '');
      if (item) items.push(item);
      current = '';
      continue;
    }
    current += char;
  }
  const last = current.trim().replace(/^['"]|['"]$/gu, '');
  if (last) items.push(last);
  return items;
}

function parseList(lines, start) {
  const match = /^(\s*)(?:paths-ignore|paths):\s*(.*)$/u.exec(lines[start]);
  const indent = match[1].length;
  const rest = match[2].trim();
  if (rest.startsWith('[')) {
    let buffer = rest;
    let index = start;
    while (
      (buffer.match(/\[/gu) ?? []).length > (buffer.match(/\]/gu) ?? []).length
    ) {
      index += 1;
      buffer += `\n${lines[index]}`;
    }
    return { items: parseFlow(buffer), index };
  }
  let index = start + 1;
  while (index < lines.length && !lines[index].trim()) index += 1;
  if (index < lines.length && lines[index].trim().startsWith('[')) {
    let buffer = lines[index];
    while (
      (buffer.match(/\[/gu) ?? []).length > (buffer.match(/\]/gu) ?? []).length
    ) {
      index += 1;
      buffer += `\n${lines[index]}`;
    }
    return { items: parseFlow(buffer), index };
  }
  const items = [];
  index = start;
  while (index + 1 < lines.length) {
    index += 1;
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (line.length - line.trimStart().length <= indent) {
      index -= 1;
      break;
    }
    const item = /^\s*-\s+['"]?(.*?)['"]?\s*$/u.exec(line);
    if (!item) {
      index -= 1;
      break;
    }
    items.push(item[1].trim().replace(/^['"]|['"]$/gu, ''));
  }
  return { items, index };
}

export function parsePullRequestFilters(text) {
  const lines = text.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^ {2}pull_request:\s*(?:$|\S)/u.test(lines[index])) continue;
    const filters = { paths: [], ignore: [] };
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (!line.trim()) continue;
      const indent = line.length - line.trimStart().length;
      if (indent <= 2 && !line.trim().startsWith('#')) break;
      const key = /^(\s*)(paths-ignore|paths):\s*/u.exec(line);
      if (!key) continue;
      const parsed = parseList(lines, cursor);
      filters[key[2] === 'paths' ? 'paths' : 'ignore'] = parsed.items;
      cursor = parsed.index;
    }
    return filters;
  }
  return null;
}

function globToRegExp(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length;) {
    if (pattern.startsWith('**/', index)) {
      source += '(?:.*/)?';
      index += 3;
      continue;
    }
    if (pattern.startsWith('**', index)) {
      source += '.*';
      index += 2;
      continue;
    }
    const char = pattern[index];
    if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else if ('.+()|[]{}^$\\'.includes(char)) source += `\\${char}`;
    else source += char;
    index += 1;
  }
  return new RegExp(`${source}$`, 'u');
}

function matches(file, pattern) {
  const negative = pattern.startsWith('!');
  const expression = globToRegExp(negative ? pattern.slice(1) : pattern);
  return { negative, hit: expression.test(file) };
}

export function fileSelectsWorkflow(filters, file) {
  const positives = filters.paths.filter((pattern) => !pattern.startsWith('!'));
  const negatives = filters.paths
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => pattern.slice(1));
  if (positives.length > 0) {
    if (!positives.some((pattern) => matches(file, pattern).hit)) return false;
    if (negatives.some((pattern) => matches(file, pattern).hit)) return false;
    if (
      filters.ignore.some(
        (pattern) => matches(file, pattern.replace(/^!/u, '')).hit
      )
    )
      return false;
    return true;
  }
  const banned = [
    ...negatives,
    ...filters.ignore.map((pattern) => pattern.replace(/^!/u, '')),
  ];
  if (banned.some((pattern) => matches(file, pattern).hit)) return false;
  return true;
}

export function loadPullRequestWorkflows(dir = WORKFLOWS_DIR) {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .sort()
    .flatMap((file) => {
      const filters = parsePullRequestFilters(
        readFileSync(path.join(dir, file), 'utf8')
      );
      return filters ? [{ file, ...filters }] : [];
    });
}

export function workflowsForChanges(inventory, changedFiles) {
  return inventory
    .filter((workflow) =>
      changedFiles.some((file) => fileSelectsWorkflow(workflow, file))
    )
    .map((workflow) => workflow.file);
}

export function runsAvoided(inventory, changedFiles) {
  const started = workflowsForChanges(inventory, changedFiles);
  return {
    started,
    avoided: inventory.length - started.length,
    total: inventory.length,
  };
}

export { SECURITY_WORKFLOWS };
