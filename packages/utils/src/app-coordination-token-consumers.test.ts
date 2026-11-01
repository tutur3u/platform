// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from './app-coordination-token';
import { readMfaTransfer } from './required-mfa-transfer';
import {
  createSessionAssuranceTransfer,
  readSessionAssuranceTransfer,
} from './session-assurance-transfer';

const repoRoot = join(__dirname, '../../..');
const TOKEN_MODULE = 'packages/utils/src/app-coordination-token.ts';
const TRANSFER_MODULE = 'packages/utils/src/session-assurance-transfer.ts';

/**
 * Reviewed `verifyAppCoordinationToken` call sites. The verifier is hard-wired
 * to `typ: 'app_coordination'`, so none of them can accept an assurance
 * transfer; `gates` are the scope/target checks each site applies on top.
 * A new call site fails this test until it is reviewed and listed here.
 */
const REVIEWED_CONSUMERS: Record<string, { calls: number; gates: string[] }> = {
  'apps/web/src/app/api/v1/auth/app-token/exchange/route.ts': {
    calls: 1,
    gates: ['APP_TOKEN_REFRESH_SCOPE'],
  },
  'apps/web/src/app/api/v1/auth/app-token/invitation-decision/route.ts': {
    calls: 1,
    gates: ['INVITATION_ACTION_SCOPE'],
  },
  'apps/web/src/lib/external-apps/workspace-cron.ts': {
    calls: 1,
    gates: ['hasScope(verification.claims.scopes'],
  },
  'apps/web/src/lib/external-apps/workspace-drive.ts': {
    calls: 1,
    gates: ['hasScope(verification.claims.scopes'],
  },
  'apps/web/src/lib/external-apps/workspace-members.ts': {
    calls: 1,
    gates: ['hasScope(verification.claims.scopes'],
  },
  'apps/web/src/lib/external-projects/access.ts': {
    calls: 2,
    gates: ['appTokenHasRequiredScope(verification.claims'],
  },
  'apps/web/src/lib/profile-media-upload-put.ts': {
    calls: 1,
    gates: ["'profile-media-upload'", 'profile-media:'],
  },
  'packages/auth/src/app-session-core.ts': {
    calls: 2,
    gates: ['APP_SESSION_SCOPE', 'APP_SESSION_REFRESH_SCOPE'],
  },
  'packages/auth/src/cli-session.ts': {
    calls: 1,
    gates: ['CLI_APP_REFRESH_SCOPE'],
  },
  // MFA policy evaluation only: binds the token subject to a principal the
  // route already authenticated; no scope gate (app_coordination typ only).
  'packages/utils/src/required-mfa-request.ts': {
    calls: 1,
    gates: ['principal.userId'],
  },
  // Route principal resolution for app-session bearers; no scope gate
  // (app_coordination typ only).
  'packages/utils/src/required-mfa-runtime.ts': {
    calls: 1,
    gates: ['verified.claims.sub'],
  },
  'packages/utils/src/required-mfa-transfer.ts': {
    calls: 1,
    gates: ['TRANSFER_SCOPE'],
  },
};

const SKIPPED_DIRECTORIES = new Set([
  '.next',
  '.turbo',
  '__tests__',
  'build',
  'coverage',
  'dist',
  'e2e',
  'node_modules',
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')
        ? []
        : sourceFiles(path);
    }
    return /\.(?:ts|tsx|mts|cts)$/u.test(entry.name) &&
      !/\.(?:test|spec)\.[cm]?tsx?$/u.test(entry.name) &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.includes('test-support')
      ? [relative(repoRoot, path).split('\\').join('/')]
      : [];
  });
}

const files = ['apps', 'packages'].flatMap((root) =>
  sourceFiles(join(repoRoot, root))
);
const read = (file: string) => readFileSync(join(repoRoot, file), 'utf8');
const count = (text: string, pattern: RegExp) =>
  [...text.matchAll(pattern)].length;

describe('app-coordination token consumers', () => {
  it('lists every verifyAppCoordinationToken call site with its gates', () => {
    const found: Record<string, number> = {};
    for (const file of files) {
      if (file === TOKEN_MODULE) continue;
      const calls = count(read(file), /\bverifyAppCoordinationToken\(/gu);
      if (calls > 0) found[file] = calls;
    }

    expect(found).toEqual(
      Object.fromEntries(
        Object.entries(REVIEWED_CONSUMERS).map(([file, { calls }]) => [
          file,
          calls,
        ])
      )
    );
    for (const [file, { gates }] of Object.entries(REVIEWED_CONSUMERS)) {
      for (const gate of gates) expect(read(file), file).toContain(gate);
    }
  });

  it('never aliases the verifier or its transfer counterpart', () => {
    for (const file of files) {
      expect(read(file), file).not.toMatch(
        /\b(?:verifyAppCoordinationToken|verifySessionAssuranceTransferToken|createSessionAssuranceTransferToken)\s+as\b/u
      );
    }
  });

  it('confines assurance transfer minting and verification to one reader', () => {
    const pattern =
      /\b(?:createSessionAssuranceTransferToken|verifySessionAssuranceTransferToken|SESSION_ASSURANCE_TRANSFER_TOKEN_TYPE)\b|session_assurance_transfer|assurance:transfer/u;
    const users = files.filter((file) => pattern.test(read(file))).sort();

    expect(users).toEqual([TOKEN_MODULE, TRANSFER_MODULE]);
    expect(
      count(read(TRANSFER_MODULE), /\bverifySessionAssuranceTransferToken\(/gu)
    ).toBe(1);
  });

  it('accepts an assurance transfer only in readSessionAssuranceTransfer', () => {
    const transfer = createSessionAssuranceTransfer('user-1', 'fysh', {
      aal: 'aal2',
      amr: ['totp'],
    });
    if (!transfer) throw new Error('transfer was not minted');

    expect(readSessionAssuranceTransfer(transfer, 'user-1', 'fysh')).toEqual({
      aal: 'aal2',
      amr: ['totp'],
    });
    // Every reviewed consumer verifies through this function first.
    expect(verifyAppCoordinationToken(transfer)).toEqual({
      error: 'Invalid token claims',
      ok: false,
    });
    expect(readMfaTransfer(transfer, 'user-1', 'fysh')).toBeNull();
  });

  it('refuses a general app-coordination token as an assurance transfer', () => {
    const token = createAppCoordinationToken({
      aal: 'aal2',
      scopes: ['assurance:transfer'],
      targetApp: 'fysh',
      userId: 'user-1',
    }).token;

    expect(verifyAppCoordinationToken(token).ok).toBe(true);
    expect(readSessionAssuranceTransfer(token, 'user-1', 'fysh')).toBeNull();
  });
});
