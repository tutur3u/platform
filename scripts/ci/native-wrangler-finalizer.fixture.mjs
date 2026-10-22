import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sealArtifact } from './native-wrangler-runtime.mjs';

export async function finalizerFixture(run) {
  const storage = await realpath(
    await mkdtemp(join(tmpdir(), 'native-finalizer-run-'))
  );
  const cwd = join(storage, 'case');
  const diagnosticRoot = join(storage, 'diagnostics');
  await mkdir(cwd);
  await mkdir(diagnosticRoot, { mode: 0o700 });
  try {
    const root = join(cwd, 'original');
    const tempRoot = join(cwd, 'temp');
    await mkdir(root);
    await mkdir(tempRoot);
    await writeFile(join(root, 'main.mjs'), 'export default {};');
    const scratch = join(tempRoot, 'declared-scratch');
    const copyRoot = join(scratch, 'artifact');
    await mkdir(copyRoot, { recursive: true });
    await writeFile(join(copyRoot, 'main.mjs'), 'export default {};');
    const foreignPath = join(cwd, 'foreign');
    await writeFile(foreignPath, 'foreign-value');
    const plan = {
      root,
      caseRoot: cwd,
      diagnosticRoot,
      tempRoot,
      scratch,
      copyRoot,
      seal: await sealArtifact(root),
      sdkWorkingDir: join(copyRoot, '.wrangler'),
      foreignPath,
      foreignValue: 'foreign-value',
    };
    await run(plan);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
