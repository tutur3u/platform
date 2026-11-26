import { readFile } from 'node:fs/promises';
import { text } from 'node:stream/consumers';
import { planDeploymentQueue, ShadowInputError } from './shadow-plan.mjs';

async function readInput(args) {
  if (args.length !== 1 || (args[0].startsWith('-') && args[0] !== '-')) {
    throw new ShadowInputError('usage: node trial.mjs <events.json|->');
  }
  const path = args[0];
  let contents;
  try {
    contents =
      path === '-' ? await text(process.stdin) : await readFile(path, 'utf8');
  } catch {
    throw new ShadowInputError('could not read input');
  }
  try {
    return JSON.parse(contents);
  } catch {
    throw new ShadowInputError('input must be valid JSON');
  }
}

try {
  const result = planDeploymentQueue(await readInput(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  if (!(error instanceof ShadowInputError)) throw error;
  process.stderr.write(
    `${JSON.stringify({
      schemaVersion: 1,
      mode: 'shadow',
      error: { code: 'invalid_input', message: error.message },
    })}\n`
  );
  process.exitCode = 1;
}
