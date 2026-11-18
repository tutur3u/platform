import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function sidebarEvidencePath(configured, root = tmpdir()) {
  return (
    configured ??
    join(mkdtempSync(join(root, 'sidebar-shift-')), 'evidence.json')
  );
}
