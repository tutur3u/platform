import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const KNOWN_RESULTS = new Set(['PASS', 'FAIL', 'WARNING']);
const DPI_TEST_NAME = 'DPIAwarenessValidation';
const DPI_RECEIPT_LINES = [
  'processDpiQuerySucceeded=True',
  'processDpiAwareness=2',
  'windowPerMonitorV2=True',
];

export function parseWackReport(xml) {
  if (typeof xml !== 'string' || xml.trim() === '') {
    return { error: 'WACK report is missing or empty' };
  }
  const reportOpen = xml.match(/<REPORT\b([^>]*)>/);
  if (!reportOpen) return { error: 'WACK report has no REPORT element' };
  const overalls = [
    ...reportOpen[1].matchAll(/\bOVERALL_RESULT="([^"]*)"/g),
  ].map((match) => match[1]);
  if (overalls.length !== 1) {
    return { error: 'WACK report overall result is missing or duplicated' };
  }
  const openings = xml.match(/<TEST\b/g) ?? [];
  const tests = [];
  for (const match of xml.matchAll(/<TEST\b([^>]*)>([\s\S]*?)<\/TEST>/g)) {
    const name = [...match[1].matchAll(/\bNAME="([^"]*)"/g)].map(
      (item) => item[1]
    );
    const optional = [...match[1].matchAll(/\bOPTIONAL="([^"]*)"/g)].map(
      (item) => item[1]
    );
    const results = [
      ...match[2].matchAll(
        /<RESULT>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*?))\s*<\/RESULT>/g
      ),
    ].map((item) => (item[1] ?? item[2] ?? '').trim());
    tests.push({
      name: name.length === 1 ? name[0] : null,
      optional: optional.length === 1 ? optional[0] : null,
      results,
    });
  }
  if (tests.length === 0 || tests.length !== openings.length) {
    return { error: 'WACK report tests are missing or malformed' };
  }
  return { overall: overalls[0], tests };
}

export function hasReviewedDpiEvidence(manifestText, dpiText) {
  if (typeof manifestText !== 'string' || typeof dpiText !== 'string') {
    return false;
  }
  const manifestDeclaresPerMonitor =
    /<dpiAware\b[^>]*>\s*true\/pm\s*<\/dpiAware>/.test(manifestText) &&
    /<dpiAwareness\b[^>]*>\s*PerMonitorV2\s*<\/dpiAwareness>/.test(
      manifestText
    );
  const lines = dpiText.split(/\r?\n/).map((line) => line.trim());
  const receiptMatches = DPI_RECEIPT_LINES.every((line) =>
    lines.includes(line)
  );
  const awarenessValues = lines
    .filter((line) => line.startsWith('processDpiAwareness='))
    .map((line) => line.slice('processDpiAwareness='.length));
  return (
    manifestDeclaresPerMonitor &&
    receiptMatches &&
    awarenessValues.length === 1 &&
    awarenessValues[0] === '2'
  );
}

export function evaluateWackVerdict({
  overall,
  tests,
  manifestText = '',
  dpiText = '',
}) {
  if (!KNOWN_RESULTS.has(overall)) {
    return reject('WACK overall result is missing or malformed');
  }
  if (!Array.isArray(tests) || tests.length === 0) {
    return reject('WACK report has no tests');
  }
  let sawRequired = false;
  for (const test of tests) {
    if (
      typeof test?.name !== 'string' ||
      test.name.trim() === '' ||
      (test.optional !== 'TRUE' && test.optional !== 'FALSE') ||
      !Array.isArray(test.results) ||
      test.results.length !== 1 ||
      !KNOWN_RESULTS.has(test.results[0])
    ) {
      return reject('WACK test verdict is missing or malformed');
    }
    if (test.optional === 'TRUE') continue;
    sawRequired = true;
    const result = test.results[0];
    if (result === 'FAIL') {
      return reject(`Required WACK test failed: ${test.name}`);
    }
    if (result === 'PASS') continue;
    if (test.name !== DPI_TEST_NAME) {
      return reject(
        `Required WACK warning is outside the allowlist: ${test.name}`
      );
    }
    if (!hasReviewedDpiEvidence(manifestText, dpiText)) {
      return reject(
        'DPIAwarenessValidation warning lacks the reviewed PerMonitorV2 manifest and companion receipt'
      );
    }
  }
  if (!sawRequired) return reject('WACK report has no required tests');
  if (overall === 'FAIL') return reject('WACK overall result is FAIL');
  return {
    accepted: true,
    reason:
      overall === 'PASS'
        ? 'WACK overall result is PASS'
        : 'WACK overall WARNING is limited to accepted required tests',
  };
}

function reject(reason) {
  return { accepted: false, reason };
}

function readOptional(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

export function evaluateWackReportFiles({ reportPath, reportDirectory }) {
  const parsed = parseWackReport(readFileSync(reportPath, 'utf8'));
  if (parsed.error) return reject(parsed.error);
  return evaluateWackVerdict({
    overall: parsed.overall,
    tests: parsed.tests,
    manifestText: readOptional(
      join(reportDirectory, 'embedded-executable.manifest')
    ),
    dpiText: readOptional(join(reportDirectory, 'dpi-awareness.txt')),
  });
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  const reportIndex = process.argv.indexOf('--report');
  const directoryIndex = process.argv.indexOf('--report-directory');
  const reportPath = reportIndex === -1 ? '' : process.argv[reportIndex + 1];
  const reportDirectory =
    directoryIndex === -1 ? '' : process.argv[directoryIndex + 1];
  if (!reportPath || !reportDirectory) {
    console.error('WACK verdict requires --report and --report-directory');
    process.exit(1);
  }
  try {
    const decision = evaluateWackReportFiles({ reportPath, reportDirectory });
    if (!decision.accepted) {
      console.error(decision.reason);
      process.exit(1);
    }
    console.log(decision.reason);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'WACK verdict failed'
    );
    process.exit(1);
  }
}
