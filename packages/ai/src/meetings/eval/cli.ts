import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadDataset, reportDirectory } from './dataset';
import { createEvalProviders } from './providers';
import { evaluate, markdownReport } from './runner';

export async function main(
  env: NodeJS.ProcessEnv = process.env
): Promise<number> {
  // SDK warnings can include raw provider responses. This finite CLI owns the process.
  globalThis.AI_SDK_LOG_WARNINGS = false;
  try {
    if (!env.MEET_STT_EVAL_MANIFEST || !env.MEET_STT_EVAL_REPORT_DIR)
      throw new Error('configuration');
    const directory = await reportDirectory(env.MEET_STT_EVAL_REPORT_DIR);
    const dataset = await loadDataset(env.MEET_STT_EVAL_MANIFEST);
    const providers = createEvalProviders(env);
    const report = await evaluate(dataset, providers);
    const prefix = join(directory, `meet-stt-${crypto.randomUUID()}`);
    await writeFile(`${prefix}.json`, `${JSON.stringify(report, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    await writeFile(`${prefix}.md`, markdownReport(report), {
      mode: 0o600,
      flag: 'wx',
    });
    console.log(markdownReport(report));
    return report.results.some((row) => row.failed > 0) ? 1 : 0;
  } catch {
    console.error(
      'Meet STT evaluation failed. Check configuration, private paths and input limits; raw errors are suppressed.'
    );
    return 1;
  }
}

if (import.meta.main) process.exitCode = await main();
