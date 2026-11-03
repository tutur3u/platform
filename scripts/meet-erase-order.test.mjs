import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('Meet migrations require V4 before V2 before V10 before V9', () => {
  execFileSync(
    'python3',
    [
      fileURLToPath(
        new URL('../apps/database/tests/meet-erase-order.py', import.meta.url)
      ),
    ],
    { stdio: 'pipe' }
  );
});
