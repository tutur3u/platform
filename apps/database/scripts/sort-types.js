#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const delimiterPairs = new Map([
  ['{', '}'],
  ['[', ']'],
  ['(', ')'],
]);

function readQuotedTextEnd(source, start) {
  const quote = source[start];
  let index = start + 1;

  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }

    if (source[index] === quote) {
      return index + 1;
    }

    index += 1;
  }

  return source.length;
}

function readLineCommentEnd(source, start) {
  const newlineIndex = source.indexOf('\n', start + 2);
  return newlineIndex === -1 ? source.length : newlineIndex;
}

function readBlockCommentEnd(source, start) {
  const commentEnd = source.indexOf('*/', start + 2);
  return commentEnd === -1 ? source.length : commentEnd + 2;
}

function skipTriviaOrString(source, index) {
  const char = source[index];
  const nextChar = source[index + 1];

  if (char === '"' || char === "'" || char === '`') {
    return readQuotedTextEnd(source, index);
  }

  if (char === '/' && nextChar === '/') {
    return readLineCommentEnd(source, index);
  }

  if (char === '/' && nextChar === '*') {
    return readBlockCommentEnd(source, index);
  }

  return index;
}

function findMatchingDelimiter(source, start) {
  const initialClose = delimiterPairs.get(source[start]);

  if (!initialClose) {
    throw new Error(`Expected opening delimiter at offset ${start}`);
  }

  const stack = [initialClose];
  let index = start + 1;

  while (index < source.length) {
    const skippedIndex = skipTriviaOrString(source, index);

    if (skippedIndex !== index) {
      index = skippedIndex;
      continue;
    }

    const char = source[index];
    const close = delimiterPairs.get(char);

    if (close) {
      stack.push(close);
      index += 1;
      continue;
    }

    if (char === stack.at(-1)) {
      stack.pop();

      if (stack.length === 0) {
        return index;
      }
    }

    index += 1;
  }

  throw new Error(`Could not find matching delimiter for offset ${start}`);
}

function splitTopLevel(source, delimiter) {
  const segments = [];
  let segmentStart = 0;
  let index = 0;

  while (index < source.length) {
    const skippedIndex = skipTriviaOrString(source, index);

    if (skippedIndex !== index) {
      index = skippedIndex;
      continue;
    }

    const char = source[index];

    if (delimiterPairs.has(char)) {
      index = findMatchingDelimiter(source, index) + 1;
      continue;
    }

    if (char === delimiter) {
      segments.push(source.slice(segmentStart, index));
      segmentStart = index + 1;
    }

    index += 1;
  }

  segments.push(source.slice(segmentStart));
  return segments;
}

function getMemberSortKey(segment) {
  const trimmed = segment.trimStart();
  const match =
    /^(?:readonly\s+)?(?:(['"])((?:\\.|(?!\1).)+)\1|([A-Za-z_$][\w$]*)|(\[[^\]]+\]))\??\s*:/.exec(
      trimmed
    );

  if (!match) {
    return null;
  }

  return match[2] ?? match[3] ?? match[4] ?? null;
}

function sortTypeLiteralMembers(source) {
  const segments = splitTopLevel(source, ';');
  const hasTrailingWhitespace =
    segments.length > 1 && segments.at(-1)?.trim() === '';
  const suffix = hasTrailingWhitespace ? segments.at(-1) : '';
  const entries = hasTrailingWhitespace ? segments.slice(0, -1) : segments;

  if (entries.length < 2) {
    return source;
  }

  const keyedEntries = entries.map((entry, index) => ({
    entry,
    index,
    key: getMemberSortKey(entry),
  }));

  if (keyedEntries.some(({ key }) => key === null)) {
    return source;
  }

  const sortedEntries = keyedEntries
    .toSorted((a, b) => {
      const keyComparison = a.key.localeCompare(b.key);
      return keyComparison === 0 ? a.index - b.index : keyComparison;
    })
    .map(({ entry }) => entry);

  const sortedSource =
    sortedEntries.join(';') + (hasTrailingWhitespace ? `;${suffix}` : '');

  return sortedSource === source ? source : sortedSource;
}

export function sortGeneratedTypes(source) {
  let output = '';
  let index = 0;

  while (index < source.length) {
    const skippedIndex = skipTriviaOrString(source, index);

    if (skippedIndex !== index) {
      output += source.slice(index, skippedIndex);
      index = skippedIndex;
      continue;
    }

    const char = source[index];
    const close = delimiterPairs.get(char);

    if (!close) {
      output += char;
      index += 1;
      continue;
    }

    const closeIndex = findMatchingDelimiter(source, index);
    const innerSource = source.slice(index + 1, closeIndex);
    const sortedInnerSource = sortGeneratedTypes(innerSource);
    const normalizedInnerSource =
      char === '{'
        ? sortTypeLiteralMembers(sortedInnerSource)
        : sortedInnerSource;

    output += `${char}${normalizedInnerSource}${close}`;
    index = closeIndex + 1;
  }

  return output;
}

function resolveTypesFilePath() {
  if (process.argv[2]) {
    return path.resolve(process.cwd(), process.argv[2]);
  }

  return path.join(
    __dirname,
    '..',
    '..',
    '..',
    'packages',
    'types',
    'src',
    'supabase.ts'
  );
}

function main() {
  try {
    const typesFilePath = resolveTypesFilePath();

    console.log('Reading types file:', typesFilePath);

    if (!fs.existsSync(typesFilePath)) {
      console.error('Error: Types file not found at', typesFilePath);
      process.exit(1);
    }

    const content = fs.readFileSync(typesFilePath, 'utf8');
    const sortedContent = sortGeneratedTypes(content);

    if (content !== sortedContent) {
      fs.writeFileSync(typesFilePath, sortedContent, 'utf8');
      console.log('Wrote sorted content back to file');
    } else {
      console.log('No changes detected, file is already sorted.');
    }

    console.log('Successfully sorted object keys in types file');
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
