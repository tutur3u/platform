import { readFileSync, writeFileSync } from 'node:fs';

const registry = JSON.parse(
  readFileSync(
    new URL('../../../config/feature-flags.json', import.meta.url),
    'utf8'
  )
);
writeFileSync(
  new URL('../src/registry.generated.ts', import.meta.url),
  `// Generated from config/feature-flags.json by bun run generate.\nexport const registry = ${JSON.stringify(registry, null, 2)} as const;\n`
);
