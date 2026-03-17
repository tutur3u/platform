/**
 * Benchmark runner for bun check performance
 * Compares: serial+ff, auto+ff, no-fail-fast
 */

const { spawnSync } = require('node:child_process');

const cases = [
  { name: 'serial+ff', args: ['scripts/check.js', '--serial', '--fail-fast'] },
  { name: 'auto+ff', args: ['scripts/check.js', '--fail-fast'] },
  { name: 'no-ff', args: ['scripts/check.js', '--no-fail-fast'] },
  { name: 'serial', args: ['scripts/check.js', '--serial'] },
  { name: 'auto', args: ['scripts/check.js'] },
];

const runs = 3;

console.log('Running benchmarks...\n');

const results = [];

for (const c of cases) {
  const times = [];
  let failed = 0;

  for (let i = 0; i < runs; i++) {
    const t0 = Date.now();
    const r = spawnSync('bun', c.args, {
      stdio: 'ignore',
      shell: true,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    const dt = Date.now() - t0;
    times.push(dt);
    if (r.status !== 0) failed++;
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  results.push({
    name: c.name,
    avg: avg,
    min: min,
    max: max,
    failed,
  });

  console.log(
    `${c.name.padEnd(12)}\tavg=${(avg / 1000).toFixed(2)}s\tmin=${(
      min / 1000
    ).toFixed(2)}s\tmax=${(max / 1000).toFixed(2)}s`
  );
}

console.log('\n--- Summary ---');
const fastest = results.reduce((a, b) => (a.avg < b.avg ? a : b));
console.log(
  `Fastest: ${fastest.name} (${(fastest.avg / 1000).toFixed(2)}s avg)`
);
