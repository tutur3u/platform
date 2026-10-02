import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Parse the canonical setup command; never execute its shell text. */
export function releaseSetupFilters(setup) {
  if (typeof setup !== 'string') throw new Error('Missing setup script');
  const parts = setup.split('&&').map((part) => part.trim());
  if (
    parts.length !== 3 ||
    parts[0] !== 'bun i' ||
    parts[1] !== 'bun portless:setup'
  )
    throw new Error('Unsupported setup bootstrap');
  const tokens = parts[2].split(/\s+/u);
  if (tokens.splice(0, 5).join(' ') !== 'bun turbo:local run build -F')
    throw new Error('Unsupported setup build');
  const filters = [];
  while (tokens.length) {
    const name = tokens.shift();
    if (
      !/^(?:@[a-z0-9_-]+\/)?[a-z0-9_-]+$/u.test(name ?? '') ||
      filters.includes(name)
    )
      throw new Error('Invalid setup filter');
    filters.push(name);
    if (tokens.length && (tokens.shift() !== '-F' || !tokens.length))
      throw new Error('Unsupported setup build option');
  }
  if (!filters.length) throw new Error('Missing setup filters');
  return filters;
}
export function releaseSetupArgs(setup, concurrency) {
  if (!/^[1-8]$/u.test(String(concurrency)))
    throw new Error('Invalid setup concurrency');
  return [
    'turbo:local',
    'run',
    'build',
    `--concurrency=${concurrency}`,
    ...releaseSetupFilters(setup).map((name) => `--filter=${name}`),
  ];
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (
    process.argv.length !== 3 ||
    !/^--concurrency=[1-8]$/u.test(process.argv[2])
  )
    throw new Error('Expected --concurrency=1..8');
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const result = spawnSync(
    'bun',
    releaseSetupArgs(packageJson.scripts?.setup, process.argv[2].split('=')[1]),
    { stdio: 'inherit', env: process.env }
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
