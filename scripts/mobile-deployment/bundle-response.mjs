#!/usr/bin/env node
// Checks the HTTP result of a mobile deployment bundle download.
//
// Usage: bundle-response.mjs <http-status> <headers-file> <body-file>
//
// The bundle body holds signing credentials, so a successful response is never
// printed. A failed response is summarized from bounded, allowlisted fields only
// (status, guard reason, Cloudflare ray id, and a short response code), then the
// body and header files are deleted so a later step cannot read them.
import { readFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SAFE_TOKEN = /^[A-Za-z0-9_.:-]{1,80}$/;
const SAFE_MESSAGE = /^[A-Za-z0-9 _.,:'-]{1,80}$/;

function safe(value, pattern = SAFE_TOKEN) {
  return typeof value === 'string' && pattern.test(value.trim())
    ? value.trim()
    : '';
}

// curl -D writes one header block per response when following redirects; the
// final block belongs to the response that produced the body.
export function finalHeaderBlock(raw) {
  const blocks = raw
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter((block) => /^HTTP\//.test(block));
  const headers = new Map();
  for (const line of (blocks.at(-1) ?? '').split(/\r?\n/).slice(1)) {
    const index = line.indexOf(':');
    if (index > 0)
      headers.set(
        line.slice(0, index).trim().toLowerCase(),
        line.slice(index + 1).trim()
      );
  }
  return headers;
}

export function bundleFailureSummary(status, headers, body) {
  let payload = null;
  try {
    payload = JSON.parse(body);
  } catch {
    payload = null;
  }
  const parts = [`HTTP ${safe(String(status), /^\d{3}$/) || 'unknown'}`];
  const reason = safe(headers.get('x-tuturuuu-guard-reason'));
  if (reason) parts.push(`guard reason ${reason}`);
  const code =
    safe(payload?.code) || safe(payload?.error?.code ?? payload?.error);
  if (code) parts.push(`code ${code}`);
  const message = safe(payload?.message, SAFE_MESSAGE);
  if (message) parts.push(`message "${message}"`);
  const server = safe(headers.get('server'));
  if (server) parts.push(`server ${server}`);
  // The guard logs this id next to its reason, which ties the failure to the
  // server log line.
  const requestId = safe(headers.get('x-tuturuuu-guard-request-id'));
  if (requestId) parts.push(`guard request ${requestId}`);
  const ray = safe(headers.get('cf-ray'));
  if (ray) parts.push(`cf-ray ${ray}`);
  return parts.join('; ');
}

export function main([status, headersPath, bodyPath]) {
  if (!status || !headersPath || !bodyPath) {
    console.error(
      'usage: bundle-response.mjs <http-status> <headers-file> <body-file>'
    );
    return 64;
  }
  const read = (path) => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return '';
    }
  };
  if (status === '200') {
    rmSync(headersPath, { force: true });
    return 0;
  }
  const summary = bundleFailureSummary(
    status,
    finalHeaderBlock(read(headersPath)),
    // Error responses are short JSON; never parse an unbounded body.
    read(bodyPath).slice(0, 4096)
  );
  rmSync(bodyPath, { force: true });
  rmSync(headersPath, { force: true });
  console.log(`::error title=Mobile deployment bundle unavailable::${summary}`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
