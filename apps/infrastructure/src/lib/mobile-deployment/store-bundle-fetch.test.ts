// @vitest-environment node
import { createHash } from 'node:crypto';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  excludeDraftInheritance: vi.fn(async () => undefined),
  getOrCreateDraftVersion: vi.fn(),
  inheritDraft: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('./draft-inheritance', () => ({
  excludeDraftInheritance: mocks.excludeDraftInheritance,
  getOrCreateDraftVersion: mocks.getOrCreateDraftVersion,
  inheritDraft: mocks.inheritDraft,
}));
vi.mock('@/lib/workspace-storage-provider', () => ({
  downloadWorkspaceStorageObjectForProvider: mocks.download,
  uploadWorkspaceStorageFileDirect: mocks.upload,
}));
vi.mock('@tuturuuu/auth/api-keys', () => ({
  hashApiKey: async (token: string) =>
    `sha256:${createHash('sha256').update(token).digest('hex')}`,
  validateApiKeyHash: async (token: string, hash: string) =>
    hash === `sha256:${createHash('sha256').update(token).digest('hex')}`,
}));

import {
  ANDROID_REQUIRED_FILE_KINDS,
  MOBILE_DEPLOYMENT_DRIVE_PREFIX,
  MOBILE_DEPLOYMENT_WORKFLOW_REF,
} from './constants';
import {
  encryptBytes,
  encryptSecretValue,
  sha256Base64Url,
  sha256Hex,
} from './crypto';
import {
  listMobileDeploymentState,
  revokeMobileDeploymentCiToken,
} from './store';
import {
  SECRET_VALUE,
  serialized,
  setupStoreFixture,
  USER_ID,
} from './store-fixtures.test-support';

const fx = setupStoreFixture(mocks);
const { auditEvents, fetchBundle, issueToken, lastAudit, seedActiveVersion } =
  fx;

describe('mobile deployment store read behavior', () => {
  it('exposes plaintext only for non-secret names and survives an undecryptable one', async () => {
    fx.db.tables.mobile_deployment_secret_values.push(
      {
        encrypted_value: encryptSecretValue(
          'https://api.example.test',
          fx.draftKey
        ),
        kind: 'scalar',
        name: 'GOOGLE_PLAY_TRACK',
        plaintext_last_four: 'test',
        plaintext_sha256: sha256Base64Url('https://api.example.test'),
        version_id: 'v-draft',
      },
      {
        encrypted_value: 'not-a-valid-ciphertext',
        kind: 'env',
        name: 'API_BASE_URL',
        version_id: 'v-draft',
      },
      {
        encrypted_value: encryptSecretValue(SECRET_VALUE, fx.draftKey),
        kind: 'env',
        name: 'API_SECRET',
        version_id: 'v-draft',
      }
    );

    const state = await listMobileDeploymentState(fx.db as never);

    expect(
      state.scalarValues.map((entry) => [entry.name, entry.value])
    ).toEqual([['GOOGLE_PLAY_TRACK', 'https://api.example.test']]);
    expect(state.envKeys.map((entry) => [entry.name, entry.value])).toEqual([
      ['API_BASE_URL', null],
      ['API_SECRET', null],
    ]);
    expect(serialized(state)).not.toContain(SECRET_VALUE);
  });

  it('does not audit admin state reads; only a CI bundle fetch is an audited read', async () => {
    seedActiveVersion();

    await listMobileDeploymentState(fx.db as never);
    expect(auditEvents()).toHaveLength(0);

    await fetchBundle(await issueToken());
    expect(auditEvents().map((event) => event.event_type)).toEqual([
      'token.issued',
      'bundle.fetched',
    ]);
  });
});

describe('mobile deployment bundle fetch audit behavior', () => {
  it('audits a successful fetch with CI identity and no secret material', async () => {
    seedActiveVersion();
    const token = await issueToken();

    const bundle = await fetchBundle(token);

    expect(bundle.envFile).toBe(`API_SECRET=${SECRET_VALUE}\n`);
    expect(bundle.scalarValues.GOOGLE_PLAY_PACKAGE_NAME).toBe(
      'com.tuturuuu.app.mobile'
    );
    expect(Object.keys(bundle.files).sort()).toEqual(
      [...ANDROID_REQUIRED_FILE_KINDS].sort()
    );
    expect(mocks.download).toHaveBeenCalledWith(
      ROOT_WORKSPACE_ID,
      'r2',
      expect.stringContaining(MOBILE_DEPLOYMENT_DRIVE_PREFIX),
      { allowReservedMobileDeploymentVault: true }
    );

    const tokenId = fx.db.tables.mobile_deployment_ci_tokens[0]?.id;
    expect(fx.db.tables.mobile_deployment_bundle_fetches).toEqual([
      expect.objectContaining({
        failure_code: null,
        github_actor: 'synthetic-actor',
        github_run_attempt: '1',
        github_run_id: '5550001',
        github_workflow_ref: MOBILE_DEPLOYMENT_WORKFLOW_REF,
        platform: 'android',
        request_ip: '203.0.113.9',
        success: true,
        token_id: tokenId,
        version_id: 'v-active',
      }),
    ]);
    expect(lastAudit()).toMatchObject({
      actor_type: 'ci',
      actor_user_id: null,
      event_type: 'bundle.fetched',
      metadata: {
        githubRunAttempt: '1',
        githubRunId: '5550001',
        platform: 'android',
        workflowRef: MOBILE_DEPLOYMENT_WORKFLOW_REF,
      },
      token_id: tokenId,
      version_id: 'v-active',
    });
    expect(serialized(auditEvents())).not.toContain(SECRET_VALUE);
    expect(fx.db.tables.mobile_deployment_ci_tokens[0]).toMatchObject({
      last_used_github_run_id: '5550001',
      last_used_platform: 'android',
    });
  });

  it('records failed fetches with a failure code, never audits them as fetched and reads no vault files', async () => {
    seedActiveVersion();
    const androidOnly = await issueToken(['android']);
    const failures: Array<[string, () => Promise<unknown>, string]> = [
      ['malformed token', () => fetchBundle('not-a-ci-token'), 'invalid_token'],
      [
        'unknown token',
        () => fetchBundle('ttr_mobile_ci_unknown-synthetic-token-value'),
        'invalid_token',
      ],
      [
        'token without the platform',
        () => fetchBundle(androidOnly, 'ios'),
        'invalid_token',
      ],
    ];

    for (const [, attempt, code] of failures) {
      await expect(attempt()).rejects.toMatchObject({ code, status: 401 });
    }

    expect(
      fx.db.tables.mobile_deployment_bundle_fetches.map((row) => [
        row.success,
        row.failure_code,
      ])
    ).toEqual([
      [false, 'invalid_token'],
      [false, 'invalid_token'],
      [false, 'invalid_token'],
    ]);
    expect(
      fx.db.tables.mobile_deployment_bundle_fetches.every(
        (row) => row.token_id === null
      )
    ).toBe(true);
    expect(
      auditEvents().some((event) => event.event_type === 'bundle.fetched')
    ).toBe(false);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('rejects revoked tokens', async () => {
    seedActiveVersion();
    const token = await issueToken();
    await revokeMobileDeploymentCiToken({
      db: fx.db as never,
      tokenId: fx.db.tables.mobile_deployment_ci_tokens[0]?.id as string,
      userId: USER_ID,
    });

    await expect(fetchBundle(token)).rejects.toMatchObject({
      code: 'invalid_token',
    });
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('rejects replayed workflow runs per platform and records the replay', async () => {
    seedActiveVersion();
    const token = await issueToken();

    await fetchBundle(token, 'android');
    await expect(fetchBundle(token, 'android')).rejects.toMatchObject({
      code: 'replay_detected',
      status: 401,
    });

    await fetchBundle(token, 'ios');
    await fetchBundle(token, 'ios');
    await expect(fetchBundle(token, 'ios')).rejects.toMatchObject({
      code: 'replay_detected',
    });

    const outcomes = fx.db.tables.mobile_deployment_bundle_fetches.map(
      (row) => [row.platform, row.success, row.failure_code]
    );
    expect(outcomes).toEqual([
      ['android', true, null],
      ['android', false, 'replay_detected'],
      ['ios', true, null],
      ['ios', true, null],
      ['ios', false, 'replay_detected'],
    ]);
    expect(
      auditEvents().filter((event) => event.event_type === 'bundle.fetched')
    ).toHaveLength(3);
  });

  it('fails with no_active_version when nothing is activated and records it', async () => {
    const token = await issueToken();
    fx.db.tables.mobile_deployment_environments[0]!.active_version_id = null;

    await expect(fetchBundle(token)).rejects.toMatchObject({
      code: 'no_active_version',
      status: 409,
    });
    expect(fx.db.tables.mobile_deployment_bundle_fetches[0]).toMatchObject({
      failure_code: 'no_active_version',
      success: false,
    });
  });

  it('refuses tampered ciphertext without releasing plaintext or auditing a fetch', async () => {
    seedActiveVersion();
    const token = await issueToken();
    const target = `${MOBILE_DEPLOYMENT_DRIVE_PREFIX}/v-active/android_upload_keystore.ciphertext.json`;
    fx.objects.set(
      target,
      Buffer.from(`${Buffer.from(fx.objects.get(target)!).toString('utf8')} `)
    );

    await expect(fetchBundle(token)).rejects.toMatchObject({
      code: 'integrity_check_failed',
      status: 409,
    });

    expect(fx.db.tables.mobile_deployment_bundle_fetches[0]).toMatchObject({
      failure_code: 'integrity_check_failed',
      success: false,
    });
    expect(
      auditEvents().some((event) => event.event_type === 'bundle.fetched')
    ).toBe(false);
    expect(
      fx.db.tables.mobile_deployment_ci_tokens[0]?.last_used_at
    ).toBeUndefined();
  });

  it('refuses a vault object that decrypts under another version key', async () => {
    seedActiveVersion();
    const token = await issueToken();
    const target = `${MOBILE_DEPLOYMENT_DRIVE_PREFIX}/v-active/android_upload_keystore.ciphertext.json`;
    const swapped = encryptBytes(
      Buffer.from('synthetic-swapped-content'),
      fx.draftKey
    );
    fx.objects.set(target, swapped);
    const artifact = fx.db.tables.mobile_deployment_file_artifacts.find(
      (row) => row.storage_path === target
    )!;
    artifact.ciphertext_sha256 = sha256Hex(swapped);

    await expect(fetchBundle(token)).rejects.toThrow('authentication failed');
    expect(fx.db.tables.mobile_deployment_bundle_fetches[0]).toMatchObject({
      failure_code: 'bundle_fetch_failed',
      success: false,
    });
  });
});
