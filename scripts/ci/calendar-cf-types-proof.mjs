import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export function standaloneDeclaration(output, main) {
  let module = relative(dirname(output), main);
  module = module.split('\\').join('/');
  if (!module.startsWith('.')) module = `./${module}`;
  return `// Generated from cf workers types; standalone Calendar compatibility declaration.
/// <reference types="@cloudflare/workers-types" />
interface __CalendarEnv { ASSETS: Fetcher; }
declare namespace Cloudflare {
  interface GlobalProps { mainModule: typeof import(${JSON.stringify(module)}); }
  interface Env extends __CalendarEnv {}
}
interface CloudflareEnv extends __CalendarEnv {}
`;
}

export function qualifyDeclarations({
  stage,
  generated,
  candidate,
  reference,
  workersTypes,
  compiler,
  execute,
}) {
  writeFileSync(
    join(stage, '.cloudflare/types/index.d.ts'),
    `${generated}\nexport type { Env };\n`
  );
  writeFileSync(
    join(stage, 'candidate.d.ts'),
    `${candidate}\nexport type { CloudflareEnv as Candidate };\n`
  );
  const names = ['Generated', 'Candidate'];
  const imports = [
    'import type { Env as Generated } from "./.cloudflare/types/index";',
    'import type { Candidate } from "./candidate";',
  ];
  if (reference !== undefined) {
    writeFileSync(
      join(stage, 'reference.d.ts'),
      `${reference}\nexport type { CloudflareEnv as Reference };\n`
    );
    imports.push('import type { Reference } from "./reference";');
    names.push('Reference');
  }
  const assertions = names.flatMap((name) => [
    `type ${name}Keys = Assert<Equal<keyof ${name}, "ASSETS">>;`,
    `type ${name}Required = Assert<Equal<{} extends Pick<${name}, "ASSETS"> ? true : false, false>>;`,
    `type ${name}NotAny = Assert<Equal<IsAny<${name}["ASSETS"]>, false>>;`,
    `type ${name}Fetcher = Assert<Equal<${name}["ASSETS"], Fetcher>>;`,
  ]);
  writeFileSync(
    join(stage, 'proof.ts'),
    `${imports.join('\n')}
type Assert<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type IsAny<T> = 0 extends (1 & T) ? true : false;
${assertions.join('\n')}
`
  );
  const project = join(stage, 'tsconfig.json');
  writeFileSync(
    project,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        lib: ['ESNext'],
        types: [],
      },
      files: [workersTypes, join(stage, 'proof.ts')],
    })
  );
  const result = execute(process.execPath, [compiler, '--project', project], {
    cwd: stage,
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
    timeout: 120_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, 'declaration parity compiler interrupted');
  assert.equal(
    result.status,
    0,
    `Calendar declaration parity failed: ${(result.stdout ?? '').slice(0, 4_000)}`
  );
}
