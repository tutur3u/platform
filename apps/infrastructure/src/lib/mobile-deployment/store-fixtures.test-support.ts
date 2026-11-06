// @vitest-environment node
// Shared fixture for the mobile deployment store tests. The calling test file
// must register the vi.mock() calls for './draft-inheritance',
// '@/lib/workspace-storage-provider' and '@tuturuuu/auth/api-keys' (they are
// hoisted per file) and pass in the hoisted mocks.
import { afterEach, beforeAll, beforeEach, type Mock, vi } from 'vitest';
import {
  ANDROID_REQUIRED_FILE_KINDS,
  IOS_REQUIRED_FILE_KINDS,
  MOBILE_DEPLOYMENT_DRIVE_PREFIX,
  MOBILE_DEPLOYMENT_SCALAR_NAMES,
  MOBILE_DEPLOYMENT_WORKFLOW_REF,
} from './constants';
import {
  createEncryptedDataKey,
  encryptBytes,
  encryptSecretValue,
  sha256Hex,
} from './crypto';
import {
  fetchMobileDeploymentBundle,
  issueMobileDeploymentCiToken,
} from './store';
import {
  createFakeVaultDb,
  type FakeVaultDb,
} from './store-fake-db.test-support';

export interface StoreFixtureMocks {
  download: Mock;
  excludeDraftInheritance: Mock;
  getOrCreateDraftVersion: Mock;
  inheritDraft: Mock;
  upload: Mock;
}

// Synthetic values only; none of these are real credentials.
export const USER_ID = '00000000-0000-4000-8000-0000000000a1';
export const SECRET_VALUE = 'synthetic-secret-value-7f3a91c2';
export const claims = {
  actor: 'synthetic-actor',
  environment: 'mobile-store-beta',
  ref: 'refs/heads/production',
  repository: 'synthetic/platform',
  runAttempt: '1',
  runId: '5550001',
  sha: '0123456789abcdef0123456789abcdef01234567',
  workflowRef: MOBILE_DEPLOYMENT_WORKFLOW_REF,
};

const scalarValues: Record<string, string> = {
  ANDROID_KEYSTORE_ALIAS: 'upload',
  ANDROID_KEYSTORE_PASSWORD: 'synthetic-store-password',
  ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD: 'synthetic-key-password',
  APPLE_BUNDLE_ID: 'com.tuturuuu.app.mobile',
  APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD: 'synthetic-p12-password',
  APPLE_TEAM_ID: 'ABCDE12345',
  APP_STORE_CONNECT_API_KEY_ID: 'ABCDE12345',
  APP_STORE_CONNECT_ISSUER_ID: 'synthetic-issuer-id',
  GOOGLE_PLAY_PACKAGE_NAME: 'com.tuturuuu.app.mobile',
  GOOGLE_PLAY_TRACK: 'internal',
};

export const serialized = (value: unknown) => JSON.stringify(value);

export function setupStoreFixture(mocks: StoreFixtureMocks) {
  // Rebuilt before every test; read them through the returned fixture object.
  const state = {
    activeKey: Buffer.alloc(0),
    db: undefined as unknown as FakeVaultDb,
    draftKey: Buffer.alloc(0),
    objects: new Map<string, Uint8Array>(),
  };

  function seedActiveVersion() {
    const { activeKey, db, objects } = state;
    for (const name of MOBILE_DEPLOYMENT_SCALAR_NAMES) {
      db.tables.mobile_deployment_secret_values.push({
        encrypted_value: encryptSecretValue(scalarValues[name]!, activeKey),
        id: `scalar-${name}`,
        kind: 'scalar',
        name,
        version_id: 'v-active',
      });
    }
    db.tables.mobile_deployment_secret_values.push({
      encrypted_value: encryptSecretValue(SECRET_VALUE, activeKey),
      id: 'env-API_SECRET',
      kind: 'env',
      name: 'API_SECRET',
      version_id: 'v-active',
    });
    for (const kind of [
      ...ANDROID_REQUIRED_FILE_KINDS,
      ...IOS_REQUIRED_FILE_KINDS,
    ]) {
      const plaintext = Buffer.from(`synthetic-file-content-${kind}`);
      const ciphertext = encryptBytes(plaintext, activeKey);
      const path = `${MOBILE_DEPLOYMENT_DRIVE_PREFIX}/v-active/${kind}.ciphertext.json`;
      objects.set(path, ciphertext);
      db.tables.mobile_deployment_file_artifacts.push({
        ciphertext_sha256: sha256Hex(ciphertext),
        content_type: 'application/octet-stream',
        filename: `${kind}.bin`,
        id: `file-${kind}`,
        kind,
        plaintext_sha256: sha256Hex(plaintext),
        plaintext_size: plaintext.byteLength,
        storage_path: path,
        storage_provider: 'r2',
        validation_errors: [],
        validation_status: 'valid',
        version_id: 'v-active',
      });
    }
  }

  async function issueToken(
    platforms: Array<'android' | 'ios'> = ['android', 'ios']
  ) {
    const { token } = await issueMobileDeploymentCiToken({
      db: state.db as never,
      expiresInDays: 30,
      name: 'synthetic token',
      platforms,
      userId: USER_ID,
    });
    return token;
  }

  const fetchBundle = (
    token: string,
    platform: 'android' | 'ios' = 'android'
  ) =>
    fetchMobileDeploymentBundle({
      claims,
      db: state.db as never,
      platform,
      requestIp: '203.0.113.9',
      token,
    });

  beforeAll(() => {
    process.env.ENCRYPTION_MASTER_KEY =
      'test-mobile-deployment-master-key-32-bytes-minimum';
  });

  beforeEach(async () => {
    state.objects = new Map();
    const draft = await createEncryptedDataKey();
    const active = await createEncryptedDataKey();
    state.draftKey = draft.dataKey;
    state.activeKey = active.dataKey;
    state.db = createFakeVaultDb({
      mobile_deployment_environments: [
        {
          active_version_id: 'v-active',
          environment: 'production',
          id: 'env-1',
        },
      ],
      mobile_deployment_versions: [
        {
          data_key_ciphertext: active.encryptedDataKey,
          environment_id: 'env-1',
          id: 'v-active',
          status: 'active',
          version: 1,
        },
        {
          data_key_ciphertext: draft.encryptedDataKey,
          environment_id: 'env-1',
          id: 'v-draft',
          status: 'draft',
          version: 2,
        },
      ],
    });
    mocks.getOrCreateDraftVersion.mockImplementation(async () =>
      state.db.tables.mobile_deployment_versions.find(
        (row) => row.id === 'v-draft'
      )
    );
    mocks.excludeDraftInheritance.mockClear();
    mocks.upload
      .mockReset()
      .mockImplementation(
        async (_ws: string, path: string, bytes: Uint8Array) => {
          state.objects.set(path, bytes);
          return { path, provider: 'r2' };
        }
      );
    mocks.download
      .mockReset()
      .mockImplementation(
        async (_ws: string, _provider: string, path: string) => ({
          buffer: state.objects.get(path),
        })
      );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  return {
    auditEvents: () => state.db.tables.mobile_deployment_audit_events,
    fetchBundle,
    issueToken,
    lastAudit: () => state.db.tables.mobile_deployment_audit_events.at(-1)!,
    seedActiveVersion,
    get activeKey() {
      return state.activeKey;
    },
    get db() {
      return state.db;
    },
    get draftKey() {
      return state.draftKey;
    },
    get objects() {
      return state.objects;
    },
  };
}
