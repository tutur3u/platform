import { afterEach, beforeEach } from 'vitest';
import { generateWorkspaceKey } from '../encryption-service';

export const TEST_MASTER_KEY = 'test-master-key-for-unit-testing-only';

export function setupEncryptionEnv() {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.ENCRYPTION_MASTER_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ENCRYPTION_MASTER_KEY = originalEnv;
    } else {
      delete process.env.ENCRYPTION_MASTER_KEY;
    }
  });
}

export { generateWorkspaceKey };
