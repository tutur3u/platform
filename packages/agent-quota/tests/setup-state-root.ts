import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.AGENT_QUOTA_STATE_ROOT = mkdtempSync(
  join(tmpdir(), 'agent-quota-vitest-')
);
process.env.VITEST = 'true';
